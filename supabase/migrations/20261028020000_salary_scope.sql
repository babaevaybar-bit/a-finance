-- Зарплаты: в «Доступе» можно дать менеджеру «Только свои / Все».
-- «Все» — менеджер видит расчёт зарплат всех сотрудников (только просмотр, без выплат и настроек).
create or replace function public.scope_pages(p_area text) returns text[]
language sql immutable as $$
  select case p_area
    when 'deals' then array['dashboard', 'sales', 'debtors', 'approvals', 'reports']
    when 'leads' then array['crm']
    when 'salary' then array['salary']
    else array[]::text[] end;
$$;

create or replace function public.all_salaries(p_month text)
returns table(manager_id uuid, manager_name text, role text, base_salary numeric, commission_pct numeric, use_personal boolean,
              revenue_base numeric, deals_count integer, commission numeric, total numeric, paid numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  company numeric; company_cnt int;
  m record; s record; personal boolean;
begin
  if not data_scope('salary') or p_month !~ '^\d{4}-\d{2}$' then return; end if;
  select coalesce(sum(coalesce(d.salary_amount, d.total_amount)), 0), count(*)::int into company, company_cnt
    from deals d where d.status = 'approved' and d.month_year = p_month;
  for m in select * from managers where is_active order by created_at loop
    select * into s from salary_settings ss where ss.manager_id = m.id;
    personal := coalesce(s.use_personal_revenue, m.role in ('Менеджер по продажам'));
    manager_id := m.id; manager_name := m.name; role := m.role;
    base_salary := coalesce(s.base_salary, 0);
    commission_pct := coalesce(s.commission_pct, 0);
    use_personal := personal;
    if personal then
      select coalesce(sum(coalesce(d.salary_amount, d.total_amount)), 0), count(*)::int into revenue_base, deals_count
        from deals d where d.status = 'approved' and d.month_year = p_month and d.manager_id = m.id;
    else
      revenue_base := company; deals_count := company_cnt;
    end if;
    commission := revenue_base * commission_pct / 100;
    total := base_salary + commission;
    select coalesce(sum(e.amount), 0) into paid from expenses e
     where e.manager_id = m.id and e.category in ('Аванс сотруднику', 'Выплата зарплаты')
       and coalesce(e.month_year, to_char(e.expense_date, 'YYYY-MM')) = p_month;
    return next;
  end loop;
end $$;
revoke all on function public.all_salaries(text) from public, anon;
grant execute on function public.all_salaries(text) to authenticated;
