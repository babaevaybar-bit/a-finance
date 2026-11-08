import { supabase } from '@/db/supabase';
import { phoneKeys } from '@/lib/phone';

/** Всё, что есть о клиенте по его телефону: покупки (сделки и оплаты), лиды, отчёты, просчёты, производство */
export interface ClientHistory {
  keys: string[];
  names: string[];
  deals: HDeal[];
  leads: { id: string; client_name: string; stage: string; pipeline: string; amount: number; created_at: string; closed_at: string | null; lost_reason: string | null; deal_id: string | null; manager_id: string | null }[];
  reports: { id: string; report_date: string; client_name: string; deal_stage: string; client_quality: string; budget: number | null; comment: string | null; manager_id: string | null; deal_id?: string | null }[];
  offline: { id: string; client_name: string | null; created_at: string; comment?: string | null }[];
  estimates: { id: string; number: number; client_name: string | null; title: string | null; total: number; updated_at: string }[];
  managers: Map<string, string>;
}
export interface HDeal {
  id: string; deal_date: string; client_name: string | null; client_phone: string | null; address: string | null;
  door_model: string | null; contract_number: string | null; total_amount: number; paid_amount: number;
  status: string; stage: string | null; manager_id: string | null; payment_method: string;
  payments: { id: string; amount: number; payment_date: string; channel: string; comment: string | null }[];
  cards: { id: string; title: string; board_id: string; list: string | null; archived: boolean }[];
}

export async function loadClientHistory(phoneOrKeys: string | string[]): Promise<ClientHistory> {
  const keys = Array.isArray(phoneOrKeys) ? phoneOrKeys : phoneKeys(phoneOrKeys);
  const empty: ClientHistory = { keys, names: [], deals: [], leads: [], reports: [], offline: [], estimates: [], managers: new Map() };
  if (!keys.length) return empty;
  const ov = (q: any) => q.overlaps('phone_keys', keys); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [deals, leads, reports, offline, estimates, managers, stages, pipes] = await Promise.all([
    ov(supabase.from('deals').select('id, deal_date, client_name, client_phone, address, door_model, contract_number, total_amount, paid_amount, status, stage, manager_id, payment_method')).order('deal_date', { ascending: false }),
    ov(supabase.from('crm_leads').select('id, client_name, stage_id, pipeline_id, amount, created_at, closed_at, lost_reason, deal_id, manager_id')).order('created_at', { ascending: false }),
    ov(supabase.from('client_reports').select('id, report_date, client_name, deal_stage, client_quality, budget, comment, manager_id')).order('report_date', { ascending: false }).limit(50),
    ov(supabase.from('offline_leads').select('id, client_name, created_at')).order('created_at', { ascending: false }).limit(50),
    ov(supabase.from('price_estimates').select('id, number, client_name, title, total, updated_at')).order('updated_at', { ascending: false }).limit(50),
    supabase.from('managers').select('id, name'),
    supabase.from('crm_stages').select('id, name'),
    supabase.from('crm_pipelines').select('id, name'),
  ]);
  const ds = (deals.data ?? []) as Omit<HDeal, 'payments' | 'cards'>[];
  const ids = ds.map(d => d.id);
  const [pays, cards] = ids.length ? await Promise.all([
    supabase.from('deal_payments').select('id, deal_id, amount, payment_date, channel, comment').in('deal_id', ids).order('payment_date'),
    supabase.from('kanban_cards').select('id, title, board_id, deal_id, archived, kanban_lists(title)').in('deal_id', ids),
  ]) : [{ data: [] }, { data: [] }];
  const stageName = new Map(((stages.data ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name]));
  const pipeName = new Map(((pipes.data ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name]));
  const out: ClientHistory = {
    keys,
    names: [],
    deals: ds.map(d => ({
      ...d,
      total_amount: Number(d.total_amount) || 0,
      paid_amount: Number(d.paid_amount) || 0,
      payments: ((pays.data ?? []) as any[]).filter(p => p.deal_id === d.id).map(p => ({ ...p, amount: Number(p.amount) || 0 })), // eslint-disable-line @typescript-eslint/no-explicit-any
      cards: ((cards.data ?? []) as any[]).filter(c => c.deal_id === d.id).map(c => ({ id: c.id, title: c.title, board_id: c.board_id, archived: !!c.archived, list: c.kanban_lists?.title ?? null })), // eslint-disable-line @typescript-eslint/no-explicit-any
    })),
    leads: ((leads.data ?? []) as any[]).map(l => ({ ...l, amount: Number(l.amount) || 0, stage: stageName.get(l.stage_id) ?? '', pipeline: pipeName.get(l.pipeline_id) ?? '' })), // eslint-disable-line @typescript-eslint/no-explicit-any
    reports: (reports.data ?? []) as ClientHistory['reports'],
    offline: (offline.data ?? []) as ClientHistory['offline'],
    estimates: (estimates.error ? [] : (estimates.data ?? [])) as ClientHistory['estimates'],
    managers: new Map(((managers.data ?? []) as { id: string; name: string }[]).map(m => [m.id, m.name])),
  };
  const names = new Map<string, number>();
  for (const n of [...out.deals.map(d => d.client_name), ...out.leads.map(l => l.client_name), ...out.reports.map(r => r.client_name), ...out.offline.map(o => o.client_name), ...out.estimates.map(e => e.client_name)]) {
    const t = (n ?? '').trim();
    if (t && !/^Сделка #\d+$/.test(t)) names.set(t, (names.get(t) ?? 0) + 1);
  }
  out.names = [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return out;
}
