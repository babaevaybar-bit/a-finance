import { supabase } from '@/db/supabase';
import type { Manager, Profile, SalesPlan, Deal, Expense, Income, Transfer, SalarySetting, EmployeePermission, ProfitRow, DailyReport, ClientReport, ClientInteraction, ClientTask, ClientChangeLog, InteractionType, DealStage, ClientQuality } from '@/types/types';

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data ?? null;
}

export async function createProfile(p: Omit<Profile, 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('profiles').insert(p);
  if (error) throw error;
}

export async function updateProfile(id: string, p: Partial<Omit<Profile, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase.from('profiles').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ─── Managers ─────────────────────────────────────────────────────────────────

export async function getManagers(): Promise<Manager[]> {
  const { data, error } = await supabase
    .from('managers')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createManager(name: string, role = 'Менеджер по продажам', userId?: string | null): Promise<string> {
  const payload: { name: string; role: string; user_id?: string } = { name: name.trim(), role };
  if (userId) payload.user_id = userId;
  const { data, error } = await supabase.from('managers').insert(payload).select('id').maybeSingle();
  if (error) throw error;
  return data?.id ?? '';
}

export async function updateManager(id: string, name: string, role?: string, userId?: string | null): Promise<void> {
  const updates: { name: string; role?: string; user_id?: string | null } = { name: name.trim() };
  if (role !== undefined) updates.role = role;
  if (userId !== undefined) updates.user_id = userId;
  const { error } = await supabase.from('managers').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteManager(id: string): Promise<void> {
  const { error } = await supabase.from('managers').delete().eq('id', id);
  if (error) throw error;
}

// ─── Sales Plans ──────────────────────────────────────────────────────────────

export async function getSalesPlans(monthYear: string): Promise<SalesPlan[]> {
  const { data, error } = await supabase
    .from('sales_plans')
    .select('*')
    .eq('month_year', monthYear)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertSalesPlan(plan: Omit<SalesPlan, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('sales_plans').upsert(
    { ...plan, updated_at: new Date().toISOString() },
    { onConflict: 'manager_id,month_year' }
  );
  if (error) throw error;
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export async function getDeals(managerId: string, monthYear: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('manager_id', managerId)
    .eq('month_year', monthYear)
    .neq('status', 'rejected')          // отклонённые не показываем в продажах
    .order('deal_date', { ascending: true })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAllDealsForMonth(monthYear: string): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('month_year', monthYear)
    .neq('status', 'rejected')          // отклонённые не показываем в отчётах
    .order('deal_date', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAllDeals(): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .neq('status', 'rejected')          // отклонённые не показываем
    .order('month_year', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Возвращает последний month_year с хотя бы одной не-rejected сделкой
export async function getLastDealsMonth(): Promise<string | null> {
  const { data, error } = await supabase
    .from('deals')
    .select('month_year')
    .neq('status', 'rejected')
    .order('month_year', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.month_year ?? null;
}

export async function createDeal(deal: Omit<Deal, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('deals').insert(deal);
  if (error) throw error;
}

export async function updateDeal(id: string, deal: Partial<Omit<Deal, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase
    .from('deals')
    .update({ ...deal, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) throw error;
}

export async function approveDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function rejectDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function getPendingDeals(): Promise<(Deal & { manager_name?: string })[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function getExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createExpense(expense: Omit<Expense, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('expenses').insert(expense);
  if (error) throw error;
}

export async function updateExpense(id: string, expense: Partial<Omit<Expense, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ ...expense, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ─── Income ───────────────────────────────────────────────────────────────────

export async function getIncome(): Promise<Income[]> {
  const { data, error } = await supabase
    .from('income')
    .select('*')
    .order('income_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createIncome(income: Omit<Income, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('income').insert(income);
  if (error) throw error;
}

export async function updateIncome(id: string, income: Partial<Omit<Income, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase
    .from('income')
    .update({ ...income, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteIncome(id: string): Promise<void> {
  const { error } = await supabase.from('income').delete().eq('id', id);
  if (error) throw error;
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export async function getTransfers(): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('transfers')
    .select('*')
    .order('transfer_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createTransfer(t: Omit<Transfer, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('transfers').insert(t);
  if (error) throw error;
}

export async function updateTransfer(id: string, t: Partial<Omit<Transfer, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase
    .from('transfers')
    .update({ ...t, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTransfer(id: string): Promise<void> {
  const { error } = await supabase.from('transfers').delete().eq('id', id);
  if (error) throw error;
}

// ─── Salary settings ──────────────────────────────────────────────────────────

export async function getSalarySettings(): Promise<SalarySetting[]> {
  const { data, error } = await supabase
    .from('salary_settings')
    .select('*');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertSalarySetting(
  s: Omit<SalarySetting, 'id' | 'created_at' | 'updated_at'>
): Promise<void> {
  const { error } = await supabase
    .from('salary_settings')
    .upsert(
      { ...s, updated_at: new Date().toISOString() },
      { onConflict: 'manager_id' }
    );
  if (error) throw error;
}

// ─── Company plan (all managers, one month) ───────────────────────────────────

export async function getCompanyPlan(monthYear: string): Promise<number> {
  const { data, error } = await supabase
    .from('sales_plans')
    .select('plan_amount')
    .eq('month_year', monthYear);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).reduce((s: number, r: { plan_amount: number }) => s + Number(r.plan_amount), 0);
}

// ─── Employee Permissions ─────────────────────────────────────────────────────

export async function getPermissionsForManager(managerId: string): Promise<EmployeePermission[]> {
  const { data, error } = await supabase
    .from('employee_permissions')
    .select('*')
    .eq('manager_id', managerId);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAllPermissions(): Promise<EmployeePermission[]> {
  const { data, error } = await supabase
    .from('employee_permissions')
    .select('*');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertPermission(
  p: Omit<EmployeePermission, 'id' | 'created_at' | 'updated_at'>
): Promise<void> {
  const { error } = await supabase
    .from('employee_permissions')
    .upsert(
      { ...p, can_approve: p.can_approve ?? false, updated_at: new Date().toISOString() },
      { onConflict: 'manager_id,page' }
    );
  if (error) throw error;
}

// ─── Profit Rows ──────────────────────────────────────────────────────────────

export async function getProfitRows(monthYear: string): Promise<ProfitRow[]> {
  const { data, error } = await supabase
    .from('profit_rows')
    .select('*')
    .eq('month_year', monthYear)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertProfitRow(
  row: Omit<ProfitRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<void> {
  const payload = { ...row, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('profit_rows').upsert(payload);
  if (error) throw error;
}

export async function deleteProfitRow(id: string): Promise<void> {
  const { error } = await supabase.from('profit_rows').delete().eq('id', id);
  if (error) throw error;
}

// ─── Daily Reports ────────────────────────────────────────────────────────────

export async function getDailyReports(filters?: { from?: string; to?: string; channel?: string }): Promise<DailyReport[]> {
  let q = supabase.from('daily_reports').select('*').order('report_date', { ascending: false });
  if (filters?.from)    q = q.gte('report_date', filters.from);
  if (filters?.to)      q = q.lte('report_date', filters.to);
  if (filters?.channel) q = q.eq('channel', filters.channel);
  const { data, error } = await q;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertDailyReport(
  r: Partial<Pick<DailyReport, 'id'>> & Omit<DailyReport, 'id' | 'created_at' | 'updated_at'>
): Promise<void> {
  const payload = { ...r, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('daily_reports').upsert(payload);
  if (error) throw error;
}

export async function deleteDailyReport(id: string): Promise<void> {
  const { error } = await supabase.from('daily_reports').delete().eq('id', id);
  if (error) throw error;
}

// ─── Client Reports ───────────────────────────────────────────────────────────

export async function getClientReports(filters?: {
  from?: string; to?: string; manager_id?: string;
  quality?: string; stage?: string;
}): Promise<ClientReport[]> {
  let q = supabase.from('client_reports').select('*').order('report_date', { ascending: false });
  if (filters?.from)       q = q.gte('report_date', filters.from);
  if (filters?.to)         q = q.lte('report_date', filters.to);
  if (filters?.manager_id) q = q.eq('manager_id', filters.manager_id);
  if (filters?.quality)    q = q.eq('client_quality', filters.quality);
  if (filters?.stage)      q = q.eq('deal_stage', filters.stage);
  const { data, error } = await q;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertClientReport(
  r: Partial<Pick<ClientReport, 'id'>> & Omit<ClientReport, 'id' | 'created_at' | 'updated_at'>
): Promise<void> {
  const payload = { ...r, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('client_reports').upsert(payload);
  if (error) throw error;
}

export async function deleteClientReport(id: string): Promise<void> {
  const { error } = await supabase.from('client_reports').delete().eq('id', id);
  if (error) throw error;
}

// ─── Client Interactions ──────────────────────────────────────────────────────
export async function getClientInteractions(clientId: string): Promise<ClientInteraction[]> {
  const { data, error } = await supabase
    .from('client_interactions')
    .select('*')
    .eq('client_id', clientId)
    .order('interacted_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function addClientInteraction(r: Omit<ClientInteraction, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('client_interactions').insert(r);
  if (error) throw error;
}

export async function deleteClientInteraction(id: string): Promise<void> {
  const { error } = await supabase.from('client_interactions').delete().eq('id', id);
  if (error) throw error;
}

// ─── Client Tasks ─────────────────────────────────────────────────────────────
export async function getClientTasks(clientId: string): Promise<ClientTask[]> {
  const { data, error } = await supabase
    .from('client_tasks')
    .select('*')
    .eq('client_id', clientId)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertClientTask(r: Partial<Pick<ClientTask, 'id'>> & Omit<ClientTask, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const { error } = await supabase.from('client_tasks').upsert({ ...r, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function deleteClientTask(id: string): Promise<void> {
  const { error } = await supabase.from('client_tasks').delete().eq('id', id);
  if (error) throw error;
}

// ─── Client Change Log ────────────────────────────────────────────────────────
export async function getClientChangeLog(clientId: string): Promise<ClientChangeLog[]> {
  const { data, error } = await supabase
    .from('client_change_log')
    .select('*')
    .eq('client_id', clientId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function addClientChangeLog(r: Omit<ClientChangeLog, 'id' | 'changed_at'>): Promise<void> {
  const { error } = await supabase.from('client_change_log').insert({ ...r, changed_at: new Date().toISOString() });
  if (error) throw error;
}

// ─── upsertClientReport with change-log support ───────────────────────────────
export async function upsertClientReportWithLog(
  r: Partial<Pick<ClientReport, 'id'>> & Omit<ClientReport, 'id' | 'created_at' | 'updated_at'>,
  previous: ClientReport | null,
  changedBy: string | null
): Promise<string> {
  const payload = { ...r, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('client_reports').upsert(payload).select('id').single();
  if (error) throw error;
  const clientId = (data as { id: string }).id ?? r.id;

  // Log tracked field changes
  if (previous && clientId) {
    const trackedFields: { key: keyof ClientReport; label: string }[] = [
      { key: 'deal_stage', label: 'Стадия сделки' },
      { key: 'client_quality', label: 'Качество клиента' },
      { key: 'is_deal_closed', label: 'Закрыта' },
      { key: 'deal_amount', label: 'Сумма сделки' },
    ];
    for (const { key, label } of trackedFields) {
      const oldVal = String((previous as unknown as Record<string, unknown>)[key as string] ?? '');
      const newVal = String((r as unknown as Record<string, unknown>)[key as string] ?? '');
      if (oldVal !== newVal) {
        await addClientChangeLog({
          client_id: clientId, changed_by: changedBy,
          field_name: label, old_value: oldVal, new_value: newVal,
        });
      }
    }
  }
  return clientId;
}

