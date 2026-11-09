import { supabase } from '@/db/supabase';

/** Часть заказа: одна сделка в CRM ↔ несколько карточек в Trello (договор 26-53 → 26-53/1, /2 …) */
export interface DealPart { id: string; deal_id: string; part_no: number; trello_card_id: string; card_name: string | null; amount: number | null; created_at: string }
export interface TrelloCardHit { id: string; name: string; url: string; stage: string; code: string | null; amount: number | null; matchedBy: string[]; dateLastActivity: string }

export async function listDealParts(dealIds: string[]): Promise<DealPart[]> {
  if (!dealIds.length) return [];
  const { data, error } = await supabase.from('deal_parts').select('*').in('deal_id', dealIds).order('part_no');
  if (error) throw error;
  return (data ?? []) as DealPart[];
}

export async function linkDealPart(dealId: string, partNo: number, card: TrelloCardHit) {
  const { error } = await supabase.from('deal_parts').insert({ deal_id: dealId, part_no: partNo, trello_card_id: card.id, card_name: card.name, amount: card.amount });
  if (error) {
    if (/deal_parts_deal_id_part_no_key|duplicate.*part_no/.test(error.message)) throw new Error(`Часть ${partNo} у этой сделки уже есть — выберите другой номер`);
    if (/trello_card_id/.test(error.message)) throw new Error('Эта карточка уже привязана к сделке');
    throw error;
  }
}

export async function unlinkDealPart(id: string) {
  const { error } = await supabase.from('deal_parts').delete().eq('id', id);
  if (error) throw error;
}

/** Все карточки клиента в Trello: по его телефонам, договорам (с частями /1, /2…) и, если нужно, по имени */
export async function findClientTrelloCards(p: { phones: string[]; contracts: string[]; q?: string }): Promise<TrelloCardHit[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const params = new URLSearchParams({ all: '1', phones: p.phones.join(','), contracts: p.contracts.join(',') });
  if (p.q) params.set('q', p.q);
  const res = await supabase.functions.invoke(`trello-deal-lookup?${params.toString()}`, {
    method: 'GET',
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (res.error || res.data?.error) throw new Error(res.data?.error ?? res.error?.message ?? 'Trello не ответил');
  return (res.data?.cards ?? []) as TrelloCardHit[];
}
