/** CRM: воронка лидов до продажи (замена amoCRM) */
import { supabase } from '@/db/supabase';

export interface CrmStage { id: string; pipeline_id: string; name: string; color: string; sort: number; kind: 'open' | 'won' | 'lost' }
export interface CrmPipeline { id: string; name: string; sort: number }
export interface CrmLead {
  id: string; pipeline_id: string; stage_id: string; manager_id: string | null;
  client_name: string; client_phone: string | null; address: string | null; source: string | null;
  amount: number; comment: string | null; tags: string[]; position: number; lost_reason: string | null;
  deal_id: string | null; created_at: string; updated_at: string; stage_changed_at: string; closed_at: string | null;
  last_message_at?: string | null; last_message_text?: string | null; unread?: number;
}
export interface CrmTask {
  id: string; lead_id: string; manager_id: string | null; kind: TaskKind; title: string;
  due_at: string; done_at: string | null; result: string | null; created_at: string;
}
export interface CrmMessage {
  id: string; lead_id: string; chat_id: string; direction: 'in' | 'out'; type: string; text: string | null;
  content_uri: string | null; status: string | null; error: string | null; author_name: string | null; created_at: string;
}
export interface CrmSettings { wa_channel_id: string | null; wa_phone: string | null; new_lead_manager_id: string | null }
export interface CrmEvent { id: string; lead_id: string; kind: string; text: string | null; data: Record<string, unknown>; author_name: string | null; created_at: string }

export type TaskKind = 'call' | 'meeting' | 'measure' | 'message' | 'other';
export const TASK_KINDS: { id: TaskKind; label: string }[] = [
  { id: 'call', label: 'Позвонить' },
  { id: 'message', label: 'Написать' },
  { id: 'meeting', label: 'Встреча' },
  { id: 'measure', label: 'Замер' },
  { id: 'other', label: 'Другое' },
];
export const taskKindLabel = (k: string) => TASK_KINDS.find(t => t.id === k)?.label ?? 'Задача';

export const SOURCES = ['Instagram', 'WhatsApp', 'Звонок', 'Салон', '2GIS', 'Сайт', 'Рекомендация', 'Повторный клиент', 'Другое'];

const err = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export async function getPipeline() {
  const [{ data: p, error: e1 }, { data: s, error: e2 }, { data: r }] = await Promise.all([
    supabase.from('crm_pipelines').select('*').order('sort'),
    supabase.from('crm_stages').select('*').order('sort'),
    supabase.from('crm_lost_reasons').select('name').order('sort'),
  ]);
  err(e1); err(e2);
  return {
    pipelines: (p ?? []) as CrmPipeline[],
    stages: (s ?? []) as CrmStage[],
    lostReasons: ((r ?? []) as { name: string }[]).map(x => x.name),
  };
}

export async function getLeads(pipelineId: string) {
  const { data, error } = await supabase.from('crm_leads').select('*').eq('pipeline_id', pipelineId).order('position').order('created_at', { ascending: false });
  err(error);
  return (data ?? []) as CrmLead[];
}

export async function getLead(id: string) {
  const { data, error } = await supabase.from('crm_leads').select('*').eq('id', id).maybeSingle();
  err(error);
  return data as CrmLead | null;
}

export async function createLead(l: Partial<CrmLead> & { pipeline_id: string; stage_id: string; client_name: string }) {
  const { data, error } = await supabase.from('crm_leads').insert(l).select('*').single();
  err(error);
  return data as CrmLead;
}

export async function updateLead(id: string, patch: Partial<CrmLead>) {
  const { data, error } = await supabase.from('crm_leads').update(patch).eq('id', id).select('*').single();
  err(error);
  return data as CrmLead;
}

export async function deleteLead(id: string) {
  const { error } = await supabase.from('crm_leads').delete().eq('id', id);
  err(error);
}

/** «Успешно»: лид → сделка в «Подтверждениях» */
export async function winLead(id: string, amount: number, paid: number, contract: string | null, door: string | null) {
  const { data, error } = await supabase.rpc('crm_win_lead', { p_lead: id, p_amount: amount, p_paid: paid, p_contract: contract, p_door: door });
  err(error);
  return data as string;
}

export async function getEvents(leadId: string) {
  const { data, error } = await supabase.from('crm_events').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(200);
  err(error);
  return (data ?? []) as CrmEvent[];
}

export async function addNote(leadId: string, text: string, authorName: string | null) {
  const { error } = await supabase.from('crm_events').insert({ lead_id: leadId, kind: 'note', text, author_name: authorName });
  err(error);
}

export async function addEvent(leadId: string, kind: string, text: string, authorName: string | null) {
  const { error } = await supabase.from('crm_events').insert({ lead_id: leadId, kind, text, author_name: authorName });
  err(error);
}

export async function getTasks(filter: { leadId?: string; managerId?: string | null; open?: boolean }) {
  let q = supabase.from('crm_tasks').select('*').order('due_at');
  if (filter.leadId) q = q.eq('lead_id', filter.leadId);
  if (filter.managerId) q = q.eq('manager_id', filter.managerId);
  if (filter.open) q = q.is('done_at', null);
  const { data, error } = await q.limit(500);
  err(error);
  return (data ?? []) as CrmTask[];
}

export async function createTask(t: { lead_id: string; manager_id: string | null; kind: TaskKind; title: string; due_at: string }) {
  const { data, error } = await supabase.from('crm_tasks').insert(t).select('*').single();
  err(error);
  return data as CrmTask;
}

export async function completeTask(id: string, result: string | null) {
  const { data, error } = await supabase.from('crm_tasks').update({ done_at: new Date().toISOString(), result }).eq('id', id).select('*').single();
  err(error);
  return data as CrmTask;
}

export async function rescheduleTask(id: string, due_at: string) {
  const { error } = await supabase.from('crm_tasks').update({ due_at }).eq('id', id);
  err(error);
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('crm_tasks').delete().eq('id', id);
  err(error);
}

// ── помощники ──
const KZ = 'Asia/Qyzylorda';
export const kzDayKey = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: KZ });
export const todayKey = () => kzDayKey(new Date());
export function dueLabel(iso: string) {
  const d = new Date(iso);
  const day = kzDayKey(d), today = todayKey();
  const tomorrow = kzDayKey(new Date(Date.now() + 86400000));
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: KZ });
  if (day === today) return `сегодня ${time}`;
  if (day === tomorrow) return `завтра ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: KZ })} ${time}`;
}
export const isOverdue = (t: CrmTask) => !t.done_at && new Date(t.due_at).getTime() < Date.now();

/** Сколько дней лид стоит на этапе */
export const daysOnStage = (l: CrmLead) => Math.floor((Date.now() - new Date(l.stage_changed_at).getTime()) / 86400000);

export function normPhone(raw: string) {
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = d.slice(1);
  return d.length === 10 ? '+7' + d : raw.trim();
}
export function showPhone(p: string | null) {
  if (!p) return '';
  const d = p.replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return p;
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

/** Готовые сроки для задачи — одним нажатием, без выбора даты */
function kzAt(dayOffset: number, hh: number, mm = 0) {
  const day = new Date(Date.now() + dayOffset * 86400000).toLocaleDateString('en-CA', { timeZone: KZ });
  return new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:00`).toISOString();
}
export const DUE_PRESETS: { label: string; at: () => string }[] = [
  { label: 'Через час', at: () => new Date(Date.now() + 3600000).toISOString() },
  { label: 'Сегодня 18:00', at: () => { const t = kzAt(0, 18); return new Date(t).getTime() > Date.now() ? t : kzAt(1, 10); } },
  { label: 'Завтра 10:00', at: () => kzAt(1, 10) },
  { label: 'Через 3 дня', at: () => kzAt(3, 10) },
  { label: 'Через неделю', at: () => kzAt(7, 10) },
];

// ── WhatsApp (Wazzup) ──
async function invokeWa<T>(body: Record<string, unknown>): Promise<T> {
  const res = await supabase.functions.invoke('crm-whatsapp', { body });
  if (res.error) {
    let msg = res.error.message;
    try { const b = await (res.error as { context?: Response }).context?.json?.(); if (b?.error) msg = b.error; } catch { /* */ }
    throw new Error(msg);
  }
  if ((res.data as { error?: string })?.error) throw new Error((res.data as { error: string }).error);
  return res.data as T;
}
export async function getMessages(leadId: string) {
  const { data, error } = await supabase.from('crm_messages').select('*').eq('lead_id', leadId).order('created_at').limit(500);
  err(error);
  return (data ?? []) as CrmMessage[];
}
export const sendWhatsApp = (leadId: string, text: string) => invokeWa<{ message: CrmMessage }>({ action: 'send', lead_id: leadId, text });
export async function markRead(leadId: string) { await supabase.rpc('crm_mark_read', { p_lead: leadId }); }
export const waStatus = () => invokeWa<{ connected: boolean; reason?: string; keyOk?: boolean; channels?: { id: string; phone: string | null; state: string | null }[]; webhook?: string | null }>({ action: 'status' });
export const waSetup = (channelId: string, managerId: string | null) => invokeWa<{ ok: boolean }>({ action: 'setup', channel_id: channelId, manager_id: managerId });
export async function getCrmSettings() {
  const { data } = await supabase.from('crm_settings').select('wa_channel_id, wa_phone, new_lead_manager_id').eq('id', 1).maybeSingle();
  return (data ?? null) as CrmSettings | null;
}

/** Передать лида другому менеджеру: задачи переходят к нему, в истории — «Передан» с комментарием */
export async function handoffLead(leadId: string, toManagerId: string, comment: string | null, stageId: string | null,
  task: { kind: TaskKind; title: string | null; due_at: string } | null) {
  const { error } = await supabase.rpc('crm_handoff', {
    p_lead: leadId, p_to: toManagerId, p_comment: comment, p_stage: stageId,
    p_task_kind: task?.kind ?? null, p_task_title: task?.title ?? null, p_task_due: task?.due_at ?? null,
  });
  if (error) throw new Error(error.message);
}
