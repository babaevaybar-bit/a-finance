-- Поручения сотрудникам со своей перепиской:
--   руководитель создаёт поручение одному или нескольким сотрудникам →
--   сотрудник делает и жмёт «Готово» → руководитель проверяет: «Подтвердить» (закрыто) или «Вернуть» с причиной →
--   сотрудник исправляет и снова «Готово». По каждому сотруднику — своя переписка.
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (description is null or length(description) <= 4000),
  link text check (link is null or link ~ '^/[a-z0-9/_-]*$'),   -- раздел сайта, куда вести сотрудника (например /profile)
  due_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_targets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  manager_id uuid not null references public.managers(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'submitted', 'rejected', 'approved')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (assignment_id, manager_id)
);
create index if not exists assignment_targets_mgr on public.assignment_targets(manager_id, status);

create table if not exists public.assignment_messages (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.assignment_targets(id) on delete cascade,
  author_id uuid default auth.uid(),
  author_name text,
  kind text not null default 'message' check (kind in ('message', 'submit', 'reject', 'approve', 'reopen')),
  text text check (text is null or length(text) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists assignment_messages_target on public.assignment_messages(target_id, created_at);

-- кто проверяет: автор поручения и руководство
create or replace function public.assignment_is_reviewer(p_assignment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments a where a.id = p_assignment and a.created_by = auth.uid())
      or exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop', 'technolog'));
$$;
create or replace function public.assignment_can_create() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop', 'technolog'));
$$;
create or replace function public.assignment_target_access(p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignment_targets t where t.id = p_target
                 and (t.manager_id = my_manager_id() or assignment_is_reviewer(t.assignment_id)));
$$;

alter table public.assignments enable row level security;
alter table public.assignment_targets enable row level security;
alter table public.assignment_messages enable row level security;

create policy assignments_select on public.assignments for select to authenticated
  using (assignment_is_reviewer(assignments.id) or exists (select 1 from assignment_targets t where t.assignment_id = assignments.id and t.manager_id = my_manager_id()));
create policy assignments_insert on public.assignments for insert to authenticated
  with check (assignment_can_create() and created_by = auth.uid());
create policy assignments_update on public.assignments for update to authenticated
  using (assignment_is_reviewer(id)) with check (assignment_is_reviewer(id));
create policy assignments_delete on public.assignments for delete to authenticated
  using (created_by = auth.uid() or is_admin());

create policy assignment_targets_select on public.assignment_targets for select to authenticated
  using (manager_id = my_manager_id() or assignment_is_reviewer(assignment_id));
create policy assignment_targets_insert on public.assignment_targets for insert to authenticated
  with check (assignment_is_reviewer(assignment_id));
create policy assignment_targets_delete on public.assignment_targets for delete to authenticated
  using (assignment_is_reviewer(assignment_id));

create policy assignment_messages_select on public.assignment_messages for select to authenticated
  using (assignment_target_access(target_id));

-- переписка и смена статуса — только через функции, чтобы нельзя было «подтвердить» самому себе
create or replace function public.assignment_act(p_target uuid, p_action text, p_text text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t assignment_targets; who text; mine boolean; reviewer boolean; msg text := nullif(trim(coalesce(p_text, '')), '');
begin
  select * into t from assignment_targets where id = p_target for update;
  if t.id is null then raise exception 'Поручение не найдено'; end if;
  mine := t.manager_id = my_manager_id();
  reviewer := assignment_is_reviewer(t.assignment_id);
  if not (mine or reviewer) then raise exception 'Нет доступа'; end if;
  select coalesce(nullif(name, 'admin'), email) into who from profiles where id = auth.uid();

  if p_action = 'message' then
    if msg is null then raise exception 'Пустое сообщение'; end if;
  elsif p_action = 'submit' then
    if not mine then raise exception 'Отметить «Готово» может только исполнитель'; end if;
    if t.status not in ('open', 'rejected') then raise exception 'Уже отправлено на проверку'; end if;
    update assignment_targets set status = 'submitted', submitted_at = now(), updated_at = now() where id = p_target;
  elsif p_action in ('approve', 'reject') then
    if not reviewer then raise exception 'Проверять может только руководитель'; end if;
    if t.status <> 'submitted' and not (p_action = 'approve' and t.status in ('open', 'rejected')) then raise exception 'Сотрудник ещё не отправил на проверку'; end if;
    if p_action = 'reject' and msg is null then raise exception 'Напишите, что исправить'; end if;
    update assignment_targets set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
      reviewed_at = now(), updated_at = now() where id = p_target;
  elsif p_action = 'reopen' then
    if not reviewer then raise exception 'Нет доступа'; end if;
    update assignment_targets set status = 'open', updated_at = now() where id = p_target;
  else
    raise exception 'Неизвестное действие';
  end if;
  insert into assignment_messages (target_id, author_id, author_name, kind, text) values (p_target, auth.uid(), who, p_action, msg);
end $$;
revoke all on function public.assignment_act(uuid, text, text) from public, anon;
grant execute on function public.assignment_act(uuid, text, text) to authenticated;

-- счётчик для колокольчика: сколько поручений ждут моего действия
create or replace function public.assignments_waiting() returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from assignment_targets where manager_id = my_manager_id() and status in ('open', 'rejected'))::int
       + (select count(*) from assignment_targets t join assignments a on a.id = t.assignment_id
          where t.status = 'submitted' and (a.created_by = auth.uid()
            or (a.created_by is null and assignment_can_create())))::int;
$$;
grant execute on function public.assignments_waiting() to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.assignment_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.assignment_targets; exception when duplicate_object then null; end;
end $$;
