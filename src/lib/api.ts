import { supabase } from '@/db/supabase';
import type { Manager, Profile, SalesPlan, Deal, Expense, Income, Transfer, SalarySetting } from '@/types/types';

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
    .order('deal_date', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getAllDeals(): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('month_year', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
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
    .upsert({ ...s, updated_at: new Date().toISOString() }, { onConflict: 'manager_id' });
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
