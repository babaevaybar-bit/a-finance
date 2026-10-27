-- CRM, этап 1: воронки, этапы, лиды, задачи, история, причины отказа
create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  name text not null,
  color text not null default '#94a3b8',
  sort int not null default 0,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost'))
);
create index if not exists crm_stages_pipeline on public.crm_stages(pipeline_id, sort);

create table if not exists public.crm_lost_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0
);

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.crm_pipelines(id),
  stage_id uuid not null references public.crm_stages(id),
  manager_id uuid references public.managers(id) on delete set null,
  client_name text not null check (length(trim(client_name)) between 1 and 120),
  client_phone text,
  address text,
  source text,
  amount numeric not null default 0,
  comment text,
  tags text[] not null default '{}',
  position double precision not null default 0,
  lost_reason text,
  deal_id uuid references public.deals(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists crm_leads_stage on public.crm_leads(stage_id, position);
create index if not exists crm_leads_manager on public.crm_leads(manager_id);
create index if not exists crm_leads_phone on public.crm_leads(client_phone);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  manager_id uuid references public.managers(id) on delete set null,
  kind text not null default 'call' check (kind in ('call', 'meeting', 'measure', 'message', 'other')),
  title text not null,
  due_at timestamptz not null,
  done_at timestamptz,
  result text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists crm_tasks_due on public.crm_tasks(manager_id, done_at, due_at);
create index if not exists crm_tasks_lead on public.crm_tasks(lead_id);

create table if not exists public.crm_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  kind text not null,               -- created | note | stage | task | task_done | won | lost | edit
  text text,
  data jsonb not null default '{}',
  author_id uuid default auth.uid(),
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists crm_events_lead on public.crm_events(lead_id, created_at desc);

-- ── права: менеджер — свои лиды, руководители (и «Данные всех менеджеров») — все ──
create or replace function public.crm_can_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_leads l where l.id = p_lead
    and (can_view_all_managers() or l.manager_id = my_manager_id() or l.created_by = auth.uid()));
$$;
revoke all on function public.crm_can_lead(uuid) from public, anon;
grant execute on function public.crm_can_lead(uuid) to authenticated;

alter table public.crm_pipelines enable row level security;
alter table public.crm_stages enable row level security;
alter table public.crm_lost_reasons enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_events enable row level security;

create policy crm_pipelines_read on public.crm_pipelines for select to authenticated using (true);
create policy crm_pipelines_admin on public.crm_pipelines for all to authenticated using (is_admin()) with check (is_admin());
create policy crm_stages_read on public.crm_stages for select to authenticated using (true);
create policy crm_stages_admin on public.crm_stages for all to authenticated using (is_admin()) with check (is_admin());
create policy crm_lost_read on public.crm_lost_reasons for select to authenticated using (true);
create policy crm_lost_admin on public.crm_lost_reasons for all to authenticated using (is_admin()) with check (is_admin());

create policy crm_leads_select on public.crm_leads for select to authenticated
  using (can_view_all_managers() or manager_id = my_manager_id() or created_by = auth.uid());
create policy crm_leads_insert on public.crm_leads for insert to authenticated
  with check (can_view_all_managers() or manager_id = my_manager_id());
create policy crm_leads_update on public.crm_leads for update to authenticated
  using (can_view_all_managers() or manager_id = my_manager_id())
  with check (can_view_all_managers() or manager_id = my_manager_id());
create policy crm_leads_delete on public.crm_leads for delete to authenticated using (can_view_all_managers());

create policy crm_tasks_all on public.crm_tasks for all to authenticated
  using (crm_can_lead(lead_id)) with check (crm_can_lead(lead_id));
create policy crm_events_select on public.crm_events for select to authenticated using (crm_can_lead(lead_id));
create policy crm_events_insert on public.crm_events for insert to authenticated with check (crm_can_lead(lead_id));

-- ── история пишется сама: создание, смена этапа, ответственного, суммы ──
create or replace function public.crm_lead_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; s_old text; s_new text; ch text[] := '{}';
begin
  select coalesce(nullif(name, 'admin'), email) into v_name from profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into crm_events (lead_id, kind, text, author_name) values (new.id, 'created', 'Создан лид', v_name);
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into s_old from crm_stages where id = old.stage_id;
    select name into s_new from crm_stages where id = new.stage_id;
    insert into crm_events (lead_id, kind, text, data, author_name)
      values (new.id, 'stage', coalesce(s_old, '—') || ' → ' || coalesce(s_new, '—'),
              jsonb_build_object('from', old.stage_id, 'to', new.stage_id), v_name);
  end if;
  if new.manager_id is distinct from old.manager_id then
    ch := ch || ('ответственный: ' || coalesce((select name from managers where id = new.manager_id), '—'));
  end if;
  if new.amount is distinct from old.amount then ch := ch || ('сумма: ' || money_kz(old.amount) || ' → ' || money_kz(new.amount)); end if;
  if new.client_name is distinct from old.client_name then ch := ch || ('имя: ' || new.client_name); end if;
  if new.client_phone is distinct from old.client_phone then ch := ch || ('телефон: ' || coalesce(new.client_phone, '—')); end if;
  if new.address is distinct from old.address then ch := ch || 'адрес'::text; end if;
  if new.source is distinct from old.source then ch := ch || ('источник: ' || coalesce(new.source, '—')); end if;
  if array_length(ch, 1) > 0 then
    insert into crm_events (lead_id, kind, text, author_name) values (new.id, 'edit', array_to_string(ch, '; '), v_name);
  end if;
  return new;
end $$;

create or replace function public.crm_lead_before() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
    select kind into k from crm_stages where id = new.stage_id;
    new.closed_at := case when k in ('won', 'lost') then coalesce(new.closed_at, now()) else null end;
  end if;
  return new;
end $$;

create trigger crm_lead_before before insert or update on public.crm_leads for each row execute function public.crm_lead_before();
create trigger crm_lead_history after insert or update on public.crm_leads for each row execute function public.crm_lead_trg();

-- ── «Успешно»: лид становится сделкой в «Подтверждениях» (как из amoCRM) ──
create or replace function public.crm_win_lead(p_lead uuid, p_amount numeric, p_paid numeric default 0, p_contract text default null, p_door text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l crm_leads; v_deal uuid; v_won uuid; v_name text; v_date date := (now() at time zone 'Asia/Qyzylorda')::date;
begin
  if not crm_can_lead(p_lead) then raise exception 'Нет доступа к лиду'; end if;
  select * into l from crm_leads where id = p_lead for update;
  if l.manager_id is null then raise exception 'Назначьте ответственного менеджера'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Укажите сумму сделки'; end if;
  select id into v_won from crm_stages where pipeline_id = l.pipeline_id and kind = 'won' order by sort limit 1;
  select coalesce(nullif(name, 'admin'), email) into v_name from profiles where id = auth.uid();
  if l.deal_id is null then
    insert into deals (manager_id, month_year, deal_date, client_name, client_phone, address, door_model, contract_number,
                       total_amount, paid_amount, payment_method, status, stage, comment)
    values (l.manager_id, to_char(v_date, 'YYYY-MM'), v_date, l.client_name, l.client_phone, l.address, p_door, p_contract,
            p_amount, coalesce(p_paid, 0), 'Другое', 'pending', 'closed',
            'Из CRM A-Finance' || coalesce(' · источник: ' || l.source, '') || '. Проверьте способ оплаты перед подтверждением.')
    returning id into v_deal;
  else
    v_deal := l.deal_id;
  end if;
  update crm_leads set stage_id = coalesce(v_won, stage_id), amount = p_amount, deal_id = v_deal, lost_reason = null where id = p_lead;
  insert into crm_events (lead_id, kind, text, data, author_name)
    values (p_lead, 'won', 'Успешно: сделка на ' || money_kz(p_amount) || ' отправлена в «Подтверждения»', jsonb_build_object('deal_id', v_deal), v_name);
  return v_deal;
end $$;
revoke all on function public.crm_win_lead(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.crm_win_lead(uuid, numeric, numeric, text, text) to authenticated;

-- ── начальная воронка «Отдел продаж» как в amoCRM ──
do $$ declare p uuid; begin
  if not exists (select 1 from crm_pipelines) then
    insert into crm_pipelines (name, sort) values ('Отдел продаж', 1) returning id into p;
    insert into crm_stages (pipeline_id, name, color, sort, kind) values
      (p, 'Новый лид',                     '#94a3b8', 10, 'open'),
      (p, 'Квалификация пройдена',         '#60a5fa', 20, 'open'),
      (p, 'Встреча назначена',             '#818cf8', 30, 'open'),
      (p, 'Встреча подтверждена',          '#a78bfa', 40, 'open'),
      (p, 'КП / презентация',              '#f472b6', 50, 'open'),
      (p, 'Замер назначен',                '#fb923c', 60, 'open'),
      (p, 'Замер проведён / КП презентовано', '#f59e0b', 70, 'open'),
      (p, 'Оффер',                         '#eab308', 80, 'open'),
      (p, 'Повторная встреча / Предоплата', '#84cc16', 90, 'open'),
      (p, 'Успешно',                       '#16a34a', 100, 'won'),
      (p, 'Отказ',                         '#ef4444', 110, 'lost');
  end if;
  insert into crm_lost_reasons (name, sort) values
    ('Дорого', 1), ('Выбрали конкурента', 2), ('Не устроили сроки', 3), ('Отложили ремонт', 4),
    ('Не выходит на связь', 5), ('Не наш продукт', 6), ('Другое', 99)
  on conflict (name) do nothing;
end $$;
