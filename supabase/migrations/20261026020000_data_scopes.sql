-- Гибкий «Доступ»: для каждого сотрудника отдельно — чьи СДЕЛКИ и чьи ЛИДЫ он видит.
--   строка employee_permissions с page = 'scope:deals' / 'scope:leads':
--     нет строки или can_view = false → только свои
--     can_view = true                → все, только просмотр
--     can_view и can_edit = true     → все, просмотр и правка
-- Старый общий переключатель 'all_data' заменён этими двумя (перенос ниже).
-- can_view_all_managers() теперь = только руководители (Главный админ, Директор, РОП):
-- раньше «Данные всех менеджеров» заодно открывал менеджеру деньги (расходы, приходы, переводы).

create or replace function public.data_scope(p_area text, p_edit boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop'))
      or exists (select 1 from employee_permissions
                 where manager_id = my_manager_id() and page = 'scope:' || p_area
                   and (case when p_edit then can_edit else can_view end));
$$;
revoke all on function public.data_scope(text, boolean) from public, anon;
grant execute on function public.data_scope(text, boolean) to authenticated;

-- Кто может подтверждать сделки (руководители и те, кому дали «Подтверждение»)
create or replace function public.can_approve_deals() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop'))
      or exists (select 1 from employee_permissions where manager_id = my_manager_id() and page = 'approvals' and can_approve);
$$;
revoke all on function public.can_approve_deals() from public, anon;
grant execute on function public.can_approve_deals() to authenticated;

-- перенос старого «Данные всех менеджеров» → все сделки и все лиды (просмотр и правка, как было)
insert into public.employee_permissions (manager_id, page, can_view, can_edit, can_approve)
  select manager_id, s.page, true, true, false
  from public.employee_permissions e cross join (values ('scope:deals'), ('scope:leads')) s(page)
  where e.page = 'all_data' and e.can_view
on conflict (manager_id, page) do nothing;
delete from public.employee_permissions where page = 'all_data';

create or replace function public.can_view_all_managers() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('director', 'director_view', 'rop'));
$$;

-- ── Сделки ──
drop policy if exists deals_select on public.deals;
drop policy if exists deals_insert on public.deals;
drop policy if exists deals_update on public.deals;
drop policy if exists deals_delete on public.deals;
create policy deals_select on public.deals for select to authenticated
  using (data_scope('deals') or manager_id = my_manager_id());
create policy deals_insert on public.deals for insert to authenticated
  with check (data_scope('deals', true) or manager_id = my_manager_id());
create policy deals_update on public.deals for update to authenticated
  using (data_scope('deals', true) or can_approve_deals() or (manager_id = my_manager_id() and status = 'pending'))
  with check (data_scope('deals', true) or can_approve_deals() or manager_id = my_manager_id());
create policy deals_delete on public.deals for delete to authenticated
  using (data_scope('deals', true) or (manager_id = my_manager_id() and status = 'pending'));

create or replace function public.can_access_deal(p_deal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deals d where d.id = p_deal and (data_scope('deals') or d.manager_id = my_manager_id()));
$$;

drop policy if exists payment_schedule_select on public.deal_payment_schedule;
drop policy if exists payment_schedule_write on public.deal_payment_schedule;
create policy payment_schedule_select on public.deal_payment_schedule for select to authenticated
  using (data_scope('deals') or exists (select 1 from deals d where d.id = deal_id and d.manager_id = my_manager_id()));
create policy payment_schedule_write on public.deal_payment_schedule for all to authenticated
  using (data_scope('deals', true) or exists (select 1 from deals d where d.id = deal_id and d.manager_id = my_manager_id()))
  with check (data_scope('deals', true) or exists (select 1 from deals d where d.id = deal_id and d.manager_id = my_manager_id()));

drop policy if exists deal_payments_select on public.deal_payments;
drop policy if exists deal_payments_insert on public.deal_payments;
create policy deal_payments_select on public.deal_payments for select to authenticated
  using (is_admin_or_viewer() or data_scope('deals') or can_access_deal(deal_id));
create policy deal_payments_insert on public.deal_payments for insert to authenticated
  with check (is_admin() or data_scope('deals', true) or can_approve_deals());

-- приход в «Финансы» по сделке создаётся при подтверждении/доплате
drop policy if exists income_insert on public.income;
create policy income_insert on public.income for insert to authenticated
  with check (can_view_all_managers() or (deal_id is not null and (data_scope('deals', true) or can_approve_deals())));

drop policy if exists "dcr select" on public.deal_change_requests;
drop policy if exists "dcr update" on public.deal_change_requests;
create policy "dcr select" on public.deal_change_requests for select to authenticated using (data_scope('deals'));
create policy "dcr update" on public.deal_change_requests for update to authenticated
  using (data_scope('deals', true) or can_approve_deals()) with check (data_scope('deals', true) or can_approve_deals());

create or replace function public.decide_deal_change(p_id uuid, p_approve boolean) returns text
language plpgsql set search_path = public as $$
declare r deal_change_requests; v_name text; cur text;
begin
  if not (data_scope('deals', true) or can_approve_deals()) then raise exception 'Нет прав'; end if;
  select * into r from deal_change_requests where id = p_id for update;
  if r.id is null then raise exception 'Не найдено'; end if;
  if r.status <> 'pending' then return r.status; end if;
  select coalesce(name, '') into v_name from managers where user_id = auth.uid() limit 1;
  if p_approve then
    if r.field in ('total_amount','paid_amount') then
      execute format('select %I::text from deals where id = $1', r.field) into cur using r.deal_id;
      execute format('update deals set %I = $1::numeric, updated_at = now() where id = $2', r.field) using r.new_value, r.deal_id;
    else
      execute format('select %I::text from deals where id = $1', r.field) into cur using r.deal_id;
      execute format('update deals set %I = $1, updated_at = now() where id = $2', r.field) using r.new_value, r.deal_id;
    end if;
    insert into financial_audit_log (entity_type, entity_id, changed_by, changed_by_name, field_name, old_value, new_value)
      values ('deal', r.deal_id, auth.uid(), coalesce(nullif(v_name,''), 'Подтверждение') || ' (из ' || r.source || ')', r.field, cur, r.new_value);
  end if;
  update deal_change_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_by_name = nullif(v_name,''), decided_at = now() where id = p_id;
  return case when p_approve then 'approved' else 'rejected' end;
end $$;

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (is_admin_or_viewer() or data_scope('deals') or manager_id = my_manager_id());
create policy notifications_update on public.notifications for update to authenticated
  using (is_admin() or data_scope('deals') or manager_id = my_manager_id())
  with check (is_admin() or data_scope('deals') or manager_id = my_manager_id());

drop policy if exists sales_plans_select on public.sales_plans;
create policy sales_plans_select on public.sales_plans for select to authenticated
  using (data_scope('deals') or manager_id = my_manager_id());

drop policy if exists salary_settings_profit_read on public.salary_settings;
create policy salary_settings_profit_read on public.salary_settings for select to authenticated
  using (page_access('profit') and data_scope('deals'));

-- ── Лиды: CRM, офлайн-лиды салона, клиентская база ──
drop policy if exists crm_leads_select on public.crm_leads;
drop policy if exists crm_leads_insert on public.crm_leads;
drop policy if exists crm_leads_update on public.crm_leads;
drop policy if exists crm_leads_delete on public.crm_leads;
create policy crm_leads_select on public.crm_leads for select to authenticated
  using (data_scope('leads') or manager_id = my_manager_id() or created_by = auth.uid());
create policy crm_leads_insert on public.crm_leads for insert to authenticated
  with check (data_scope('leads', true) or manager_id = my_manager_id());
create policy crm_leads_update on public.crm_leads for update to authenticated
  using (data_scope('leads', true) or manager_id = my_manager_id())
  with check (data_scope('leads', true) or manager_id = my_manager_id());
create policy crm_leads_delete on public.crm_leads for delete to authenticated using (data_scope('leads', true));

create or replace function public.crm_can_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_leads l where l.id = p_lead
    and (data_scope('leads') or l.manager_id = my_manager_id() or l.created_by = auth.uid()));
$$;

drop policy if exists offline_leads_select on public.offline_leads;
drop policy if exists offline_leads_insert on public.offline_leads;
drop policy if exists offline_leads_update on public.offline_leads;
drop policy if exists offline_leads_delete on public.offline_leads;
create policy offline_leads_select on public.offline_leads for select to authenticated
  using (data_scope('leads') or manager_id = my_manager_id());
create policy offline_leads_insert on public.offline_leads for insert to authenticated
  with check (data_scope('leads', true) or manager_id = my_manager_id());
create policy offline_leads_update on public.offline_leads for update to authenticated
  using (data_scope('leads', true) or (manager_id = my_manager_id() and created_at > now() - interval '24 hours'))
  with check (data_scope('leads', true) or manager_id = my_manager_id());
create policy offline_leads_delete on public.offline_leads for delete to authenticated
  using (data_scope('leads', true) or (manager_id = my_manager_id() and created_at > now() - interval '24 hours'));

drop policy if exists client_reports_select on public.client_reports;
drop policy if exists client_reports_insert on public.client_reports;
drop policy if exists client_reports_update on public.client_reports;
drop policy if exists client_reports_delete on public.client_reports;
create policy client_reports_select on public.client_reports for select to authenticated
  using (data_scope('leads') or manager_id = auth.uid());
create policy client_reports_insert on public.client_reports for insert to authenticated
  with check (data_scope('leads', true) or manager_id = auth.uid());
create policy client_reports_update on public.client_reports for update to authenticated
  using (data_scope('leads', true) or manager_id = auth.uid())
  with check (data_scope('leads', true) or manager_id = auth.uid());
create policy client_reports_delete on public.client_reports for delete to authenticated
  using (data_scope('leads', true) or manager_id = auth.uid());

drop policy if exists client_tasks_all on public.client_tasks;
create policy client_tasks_all on public.client_tasks for all to authenticated
  using (exists (select 1 from client_reports cr where cr.id = client_id and (data_scope('leads') or cr.manager_id = auth.uid())))
  with check (exists (select 1 from client_reports cr where cr.id = client_id and (data_scope('leads') or cr.manager_id = auth.uid())));
drop policy if exists client_interactions_all on public.client_interactions;
create policy client_interactions_all on public.client_interactions for all to authenticated
  using (exists (select 1 from client_reports cr where cr.id = client_id and (data_scope('leads') or cr.manager_id = auth.uid())))
  with check (exists (select 1 from client_reports cr where cr.id = client_id and (data_scope('leads') or cr.manager_id = auth.uid())));
drop policy if exists client_change_log_all on public.client_change_log;
create policy client_change_log_all on public.client_change_log for all to authenticated
  using (exists (select 1 from client_reports cr where cr.id = client_id and (data_scope('leads') or cr.manager_id = auth.uid())))
  with check (exists (select 1 from client_reports cr where cr.id = client_id and (data_scope('leads') or cr.manager_id = auth.uid())));
