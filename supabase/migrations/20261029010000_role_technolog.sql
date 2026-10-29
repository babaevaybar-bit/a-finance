-- Новая роль входа «Технолог»: как РОП — видит все сделки и CRM, подтверждает сделки; разделы настраиваются в «Доступе».
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['director', 'director_view', 'rop', 'technolog', 'manager', 'lidorub']));

create or replace function public.can_view_all_managers() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop', 'technolog'));
$$;

create or replace function public.can_approve_deals() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop', 'technolog'))
      or exists (select 1 from employee_permissions where manager_id = my_manager_id() and page = 'approvals' and can_approve);
$$;

create or replace function public.data_scope(p_area text, p_edit boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop', 'technolog'))
      or exists (select 1 from employee_permissions
                 where manager_id = my_manager_id() and scope_all and can_view
                   and page = any (scope_pages(p_area))
                   and (not p_edit or can_edit));
$$;

alter policy amo_daily_reports_read on public.amo_daily_reports
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = any (array['director', 'director_view', 'rop', 'technolog'])));
alter policy estimates_select on public.estimates
  using (created_by = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = any (array['director', 'director_view', 'rop', 'technolog'])));
alter policy training_progress_select on public.training_progress
  using (user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = any (array['director', 'director_view', 'rop', 'technolog'])));
