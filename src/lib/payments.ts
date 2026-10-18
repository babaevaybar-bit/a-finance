import type { Deal } from '@/types/types';

// Доплата: остаток клиент вносит, когда заказ из производства приходит на «Склад Альянс».
// Этап берётся из Trello (обновляется каждые 30 минут), дата доплаты при этом ставится сама.
export const PAYMENT_DUE_STAGES = ['Склад Альянс', 'Склад Шымкент', 'План к установке', 'Ожидание готовности объекта', 'Обект Сдан'];
export const PAYMENT_TRIGGER_STAGE = 'Склад Альянс';

export const isDueStage = (s: string | null | undefined) => !!s && PAYMENT_DUE_STAGES.includes(s.trim());

/** Заказ ещё в производстве (этап известен и не дошёл до склада) — доплата пока не нужна. */
export function waitingForWarehouse(d: Pick<Deal, 'production_stage'>): boolean {
  return !!d.production_stage && !isDueStage(d.production_stage);
}

/** Дата, когда надо доплатить, или null, если пока рано / неизвестно. */
export function effectiveDueDate(d: Pick<Deal, 'production_stage' | 'next_payment_date'>): string | null {
  if (waitingForWarehouse(d)) return null;
  return d.next_payment_date ?? null;
}
