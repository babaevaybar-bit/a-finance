import { supabase } from '@/db/supabase';

// ─── Доски в стиле Trello: типы и запросы ─────────────────────────────────

export interface KBoard {
  id: string; title: string; background: string; starred: boolean; archived: boolean;
  created_at: string; updated_at: string;
}
export interface KList { id: string; board_id: string; title: string; position: number; archived: boolean; }
export interface KLabel { id: string; board_id: string; name: string; color: string; }
export interface KCard {
  id: string; board_id: string; list_id: string; title: string; description: string | null;
  position: number; start_at: string | null; due_at: string | null; due_done: boolean;
  cover_color: string | null; archived: boolean; deal_id: string | null; created_at: string; updated_at: string;
  // собранное для мини-карточки
  label_ids: string[]; member_ids: string[];
  checklist_total: number; checklist_done: number; comments: number; attachments: number;
}
export interface KChecklist { id: string; card_id: string; title: string; position: number; items: KChecklistItem[]; }
export interface KChecklistItem { id: string; checklist_id: string; text: string; done: boolean; position: number; }
export interface KComment { id: string; card_id: string; author_name: string | null; text: string; created_at: string; }
export interface KAttachment { id: string; card_id: string; path: string; name: string; size: number | null; mime: string | null; uploaded_by_name: string | null; created_at: string; }
export interface KActivity { id: string; board_id: string; card_id: string | null; actor_name: string | null; action: string; created_at: string; }

// Цвета фона досок и меток — как в Trello
export const BOARD_BACKGROUNDS: Record<string, string> = {
  emerald: 'linear-gradient(135deg, #1f6f5c 0%, #2f8f6f 100%)',
  ocean: 'linear-gradient(135deg, #0c66e4 0%, #1d7afc 100%)',
  sunset: 'linear-gradient(135deg, #e2483d 0%, #f87462 100%)',
  violet: 'linear-gradient(135deg, #5e4db2 0%, #8f7ee7 100%)',
  amber: 'linear-gradient(135deg, #b65c02 0%, #e2b203 100%)',
  slate: 'linear-gradient(135deg, #2c3e5d 0%, #44546f 100%)',
  pink: 'linear-gradient(135deg, #ae4787 0%, #e774bb 100%)',
  sand: 'linear-gradient(135deg, #8c6a3d 0%, #c9a26b 100%)',
};
export const LABEL_COLORS: { key: string; hex: string; name: string }[] = [
  { key: 'green', hex: '#4bce97', name: 'Зелёный' },
  { key: 'yellow', hex: '#e2b203', name: 'Жёлтый' },
  { key: 'orange', hex: '#fea362', name: 'Оранжевый' },
  { key: 'red', hex: '#f87168', name: 'Красный' },
  { key: 'purple', hex: '#9f8fef', name: 'Фиолетовый' },
  { key: 'blue', hex: '#579dff', name: 'Синий' },
  { key: 'sky', hex: '#6cc3e0', name: 'Голубой' },
  { key: 'lime', hex: '#94c748', name: 'Салатовый' },
  { key: 'pink', hex: '#e774bb', name: 'Розовый' },
  { key: 'black', hex: '#8590a2', name: 'Серый' },
];
export const labelHex = (c: string) => LABEL_COLORS.find(l => l.key === c)?.hex ?? c;

// Шаблоны новых досок
export const BOARD_TEMPLATES: { key: string; name: string; lists: string[] }[] = [
  { key: 'empty', name: 'Пустая доска', lists: ['Нужно сделать', 'В работе', 'Готово'] },
  { key: 'production', name: 'Производство дверей', lists: ['Продано', 'Замер', 'Заказ поставщику', 'В производстве', 'Склад', 'Доставка', 'Монтаж', 'Завершено'] },
  { key: 'tasks', name: 'Задачи офиса', lists: ['Входящие', 'На этой неделе', 'В работе', 'На проверке', 'Готово'] },
];
const DEFAULT_LABELS = [
  { name: 'Срочно', color: 'red' }, { name: 'Ждём клиента', color: 'yellow' }, { name: 'Ждём поставщика', color: 'orange' },
  { name: 'Готово к монтажу', color: 'green' }, { name: 'Входные', color: 'blue' }, { name: 'Межкомнатные', color: 'purple' },
];

export const lastOf = <T,>(arr: T[]): T | undefined => arr[arr.length - 1];

// Позиция между соседями (дробная — без пересчёта всех карточек)
export function positionBetween(before?: number, after?: number): number {
  if (before == null && after == null) return 1024;
  if (before == null) return (after as number) / 2;
  if (after == null) return before + 1024;
  return (before + after) / 2;
}

async function actorName(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle();
  return data?.name ?? user.email ?? null;
}
export async function logActivity(boardId: string, action: string, cardId?: string | null) {
  try {
    await supabase.from('kanban_activity').insert({ board_id: boardId, card_id: cardId ?? null, action, actor_name: await actorName() });
    await supabase.from('kanban_boards').update({ updated_at: new Date().toISOString() }).eq('id', boardId);
  } catch { /* журнал — не критично */ }
}

// ── Доски ──
export async function getBoards(): Promise<KBoard[]> {
  const { data, error } = await supabase.from('kanban_boards').select('*').eq('archived', false).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as KBoard[];
}
export async function getArchivedBoards(): Promise<KBoard[]> {
  const { data } = await supabase.from('kanban_boards').select('*').eq('archived', true).order('updated_at', { ascending: false });
  return (data ?? []) as KBoard[];
}
export async function getBoard(id: string): Promise<KBoard | null> {
  const { data } = await supabase.from('kanban_boards').select('*').eq('id', id).maybeSingle();
  return data as KBoard | null;
}
export async function createBoard(title: string, background: string, templateKey: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('kanban_boards').insert({ title, background, created_by: user?.id ?? null }).select('id').single();
  if (error || !data) throw error ?? new Error('Не удалось создать доску');
  const tpl = BOARD_TEMPLATES.find(t => t.key === templateKey) ?? BOARD_TEMPLATES[0];
  await supabase.from('kanban_lists').insert(tpl.lists.map((t, i) => ({ board_id: data.id, title: t, position: (i + 1) * 1024 })));
  await supabase.from('kanban_labels').insert(DEFAULT_LABELS.map(l => ({ ...l, board_id: data.id })));
  await logActivity(data.id, `создал(а) доску «${title}»`);
  return data.id;
}
export async function updateBoard(id: string, patch: Partial<Pick<KBoard, 'title' | 'background' | 'starred' | 'archived'>>) {
  const { error } = await supabase.from('kanban_boards').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteBoard(id: string) {
  const { error } = await supabase.from('kanban_boards').delete().eq('id', id);
  if (error) throw error;
}

// ── Содержимое доски ──
export async function getBoardContent(boardId: string): Promise<{ lists: KList[]; cards: KCard[]; labels: KLabel[] }> {
  const [l, c, lb] = await Promise.all([
    supabase.from('kanban_lists').select('*').eq('board_id', boardId).order('position'),
    supabase.from('kanban_cards')
      .select('*, kanban_card_labels(label_id), kanban_card_members(manager_id), kanban_checklists(kanban_checklist_items(done)), kanban_comments(count), kanban_attachments(count)')
      .eq('board_id', boardId).order('position'),
    supabase.from('kanban_labels').select('*').eq('board_id', boardId),
  ]);
  if (l.error) throw l.error;
  if (c.error) throw c.error;
  const cards: KCard[] = (c.data ?? []).map((r: any) => {
    const items = (r.kanban_checklists ?? []).flatMap((cl: any) => cl.kanban_checklist_items ?? []);
    return {
      ...r,
      label_ids: (r.kanban_card_labels ?? []).map((x: any) => x.label_id),
      member_ids: (r.kanban_card_members ?? []).map((x: any) => x.manager_id),
      checklist_total: items.length,
      checklist_done: items.filter((i: any) => i.done).length,
      comments: r.kanban_comments?.[0]?.count ?? 0,
      attachments: r.kanban_attachments?.[0]?.count ?? 0,
    };
  });
  return { lists: (l.data ?? []) as KList[], cards, labels: (lb.data ?? []) as KLabel[] };
}

// ── Колонки ──
export async function createList(boardId: string, title: string, position: number) {
  const { error } = await supabase.from('kanban_lists').insert({ board_id: boardId, title, position });
  if (error) throw error;
  await logActivity(boardId, `добавил(а) колонку «${title}»`);
}
export async function updateList(id: string, patch: Partial<Pick<KList, 'title' | 'position' | 'archived'>>) {
  const { error } = await supabase.from('kanban_lists').update(patch).eq('id', id);
  if (error) throw error;
}

// ── Карточки ──
export async function createCard(boardId: string, listId: string, title: string, position: number) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('kanban_cards')
    .insert({ board_id: boardId, list_id: listId, title, position, created_by: user?.id ?? null }).select('id').single();
  if (error) throw error;
  await logActivity(boardId, `добавил(а) карточку «${title}»`, data?.id);
  return data?.id as string;
}
export async function updateCard(id: string, patch: Partial<Pick<KCard, 'title' | 'description' | 'list_id' | 'position' | 'start_at' | 'due_at' | 'due_done' | 'cover_color' | 'archived' | 'deal_id'>>) {
  const { error } = await supabase.from('kanban_cards').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteCard(id: string) {
  const { error } = await supabase.from('kanban_cards').delete().eq('id', id);
  if (error) throw error;
}
export async function copyCard(card: KCard, toListId: string, position: number) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('kanban_cards').insert({
    board_id: card.board_id, list_id: toListId, title: card.title + ' (копия)', description: card.description,
    position, start_at: card.start_at, due_at: card.due_at, cover_color: card.cover_color, created_by: user?.id ?? null,
  }).select('id').single();
  if (error || !data) throw error;
  if (card.label_ids.length) await supabase.from('kanban_card_labels').insert(card.label_ids.map(l => ({ card_id: data.id, label_id: l })));
  if (card.member_ids.length) await supabase.from('kanban_card_members').insert(card.member_ids.map(m => ({ card_id: data.id, manager_id: m })));
  const { data: cls } = await supabase.from('kanban_checklists').select('title, position, kanban_checklist_items(text, done, position)').eq('card_id', card.id);
  for (const cl of cls ?? []) {
    const { data: nc } = await supabase.from('kanban_checklists').insert({ card_id: data.id, title: cl.title, position: cl.position }).select('id').single();
    const items = (cl as any).kanban_checklist_items ?? [];
    if (nc && items.length) await supabase.from('kanban_checklist_items').insert(items.map((i: any) => ({ ...i, checklist_id: nc.id })));
  }
  return data.id as string;
}

// ── Метки ──
export async function createLabel(boardId: string, name: string, color: string) {
  const { data, error } = await supabase.from('kanban_labels').insert({ board_id: boardId, name, color }).select('*').single();
  if (error) throw error;
  return data as KLabel;
}
export async function updateLabel(id: string, patch: Partial<Pick<KLabel, 'name' | 'color'>>) {
  const { error } = await supabase.from('kanban_labels').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteLabel(id: string) {
  const { error } = await supabase.from('kanban_labels').delete().eq('id', id);
  if (error) throw error;
}
export async function toggleCardLabel(cardId: string, labelId: string, on: boolean) {
  if (on) await supabase.from('kanban_card_labels').insert({ card_id: cardId, label_id: labelId });
  else await supabase.from('kanban_card_labels').delete().eq('card_id', cardId).eq('label_id', labelId);
}
export async function toggleCardMember(cardId: string, managerId: string, on: boolean) {
  if (on) await supabase.from('kanban_card_members').insert({ card_id: cardId, manager_id: managerId });
  else await supabase.from('kanban_card_members').delete().eq('card_id', cardId).eq('manager_id', managerId);
}

// ── Детали карточки ──
export async function getCardDetails(cardId: string) {
  const [cl, cm, at, ac] = await Promise.all([
    supabase.from('kanban_checklists').select('*, kanban_checklist_items(*)').eq('card_id', cardId).order('position'),
    supabase.from('kanban_comments').select('*').eq('card_id', cardId).order('created_at', { ascending: false }),
    supabase.from('kanban_attachments').select('*').eq('card_id', cardId).order('created_at', { ascending: false }),
    supabase.from('kanban_activity').select('*').eq('card_id', cardId).order('created_at', { ascending: false }).limit(50),
  ]);
  const checklists: KChecklist[] = (cl.data ?? []).map((c: any) => ({
    id: c.id, card_id: c.card_id, title: c.title, position: c.position,
    items: [...(c.kanban_checklist_items ?? [])].sort((a: any, b: any) => a.position - b.position),
  }));
  return {
    checklists,
    comments: (cm.data ?? []) as KComment[],
    attachments: (at.data ?? []) as KAttachment[],
    activity: (ac.data ?? []) as KActivity[],
  };
}
export async function addChecklist(cardId: string, title: string, position: number) {
  const { error } = await supabase.from('kanban_checklists').insert({ card_id: cardId, title, position });
  if (error) throw error;
}
export async function renameChecklist(id: string, title: string) { await supabase.from('kanban_checklists').update({ title }).eq('id', id); }
export async function deleteChecklist(id: string) { await supabase.from('kanban_checklists').delete().eq('id', id); }
export async function addChecklistItem(checklistId: string, text: string, position: number) {
  const { error } = await supabase.from('kanban_checklist_items').insert({ checklist_id: checklistId, text, position });
  if (error) throw error;
}
export async function updateChecklistItem(id: string, patch: Partial<Pick<KChecklistItem, 'text' | 'done'>>) {
  await supabase.from('kanban_checklist_items').update(patch).eq('id', id);
}
export async function deleteChecklistItem(id: string) { await supabase.from('kanban_checklist_items').delete().eq('id', id); }

export async function addComment(cardId: string, text: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('kanban_comments').insert({ card_id: cardId, text, author_id: user?.id ?? null, author_name: await actorName() });
  if (error) throw error;
}
export async function deleteComment(id: string) { await supabase.from('kanban_comments').delete().eq('id', id); }

export async function uploadAttachment(cardId: string, file: File) {
  const safe = file.name.replace(/[^\w.\-а-яА-ЯёЁ ]/g, '_');
  const path = `${cardId}/${Date.now()}_${safe}`;
  const { error } = await supabase.storage.from('kanban-files').upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  await supabase.from('kanban_attachments').insert({ card_id: cardId, path, name: file.name, size: file.size, mime: file.type || null, uploaded_by_name: await actorName() });
}
export async function attachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('kanban-files').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
export async function deleteAttachment(a: KAttachment) {
  await supabase.storage.from('kanban-files').remove([a.path]);
  await supabase.from('kanban_attachments').delete().eq('id', a.id);
}
export async function getBoardActivity(boardId: string): Promise<KActivity[]> {
  const { data } = await supabase.from('kanban_activity').select('*').eq('board_id', boardId).order('created_at', { ascending: false }).limit(80);
  return (data ?? []) as KActivity[];
}
