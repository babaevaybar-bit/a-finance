import { supabase } from '@/db/supabase';

export type TargetStatus = 'open' | 'submitted' | 'rejected' | 'approved';
export interface Assignment {
  id: string; title: string; description: string | null; link: string | null; due_at: string | null;
  created_by: string | null; created_by_name: string | null; created_at: string;
}
export interface AssignmentTarget {
  id: string; assignment_id: string; manager_id: string; status: TargetStatus;
  submitted_at: string | null; reviewed_at: string | null; updated_at: string;
}
export interface AssignmentMessage {
  id: string; target_id: string; author_id: string | null; author_name: string | null;
  kind: 'message' | 'submit' | 'reject' | 'approve' | 'reopen'; text: string | null; created_at: string;
}

export const STATUS: Record<TargetStatus, { label: string; cls: string }> = {
  open: { label: 'Не сделано', cls: 'bg-muted text-muted-foreground border-border' },
  submitted: { label: 'На проверке', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  rejected: { label: 'Вернули', cls: 'bg-red-50 text-red-700 border-red-200' },
  approved: { label: 'Подтверждено', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

/** Разделы сайта, куда поручение может вести сотрудника */
export const LINKS: { value: string; label: string }[] = [
  { value: '', label: 'Без ссылки' },
  { value: '/profile', label: 'Мой профиль' },
  { value: '/sales', label: 'Продажи' },
  { value: '/crm', label: 'CRM' },
  { value: '/training', label: 'Обучение' },
  { value: '/daily-report', label: 'Ежедневный отчёт' },
];

export const TEMPLATES: { title: string; description: string; link: string }[] = [
  { title: 'Заполнить профиль и поставить фото', link: '/profile',
    description: 'Откройте «Мой профиль»: поставьте своё фото (лицо хорошо видно), укажите телефон, дату рождения, город и пару слов о себе. Когда всё готово — нажмите «Готово».' },
];

const err = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export async function loadAssignments() {
  const [a, t] = await Promise.all([
    supabase.from('assignments').select('*').order('created_at', { ascending: false }).limit(300),
    supabase.from('assignment_targets').select('*').limit(3000),
  ]);
  err(a.error); err(t.error);
  return { assignments: (a.data ?? []) as Assignment[], targets: (t.data ?? []) as AssignmentTarget[] };
}

export async function createAssignment(a: { title: string; description: string | null; link: string | null; due_at: string | null; created_by_name: string | null }, managerIds: string[]) {
  const { data, error } = await supabase.from('assignments').insert(a).select('id').single();
  err(error);
  const id = (data as { id: string }).id;
  const { error: e2 } = await supabase.from('assignment_targets').insert(managerIds.map(m => ({ assignment_id: id, manager_id: m })));
  if (e2) { await supabase.from('assignments').delete().eq('id', id); throw new Error(e2.message); }
  return id;
}

export async function deleteAssignment(id: string) {
  const { error } = await supabase.from('assignments').delete().eq('id', id);
  err(error);
}

export async function getThread(targetId: string) {
  const { data, error } = await supabase.from('assignment_messages').select('*').eq('target_id', targetId).order('created_at').limit(500);
  err(error);
  return (data ?? []) as AssignmentMessage[];
}

export async function act(targetId: string, action: AssignmentMessage['kind'], text?: string | null) {
  const { error } = await supabase.rpc('assignment_act', { p_target: targetId, p_action: action, p_text: text ?? null });
  err(error);
}

export async function waitingCount() {
  const { data } = await supabase.rpc('assignments_waiting');
  return Number(data ?? 0);
}
