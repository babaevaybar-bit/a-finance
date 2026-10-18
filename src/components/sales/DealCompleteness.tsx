import React from 'react';
import type { Deal } from '@/types/types';
import { CHANNELS, SPLIT_PAYMENT_METHOD } from '@/types/types';

// Заполненность сделки: какие поля важны для сверки с Trello, напоминаний и «Финансов».
// Способ оплаты учитывается, только когда есть оплата. Дату доплаты не требуем — она ставится сама,
// когда заказ приходит на «Склад Альянс».
export function dealCompleteness(d: Deal): { filled: number; total: number; missing: string[] } {
  const paid = Number(d.paid_amount) || 0;
  const total = Number(d.total_amount) || 0;
  const validMethod =
    (CHANNELS as readonly string[]).includes(d.payment_method) ||
    (d.payment_method === SPLIT_PAYMENT_METHOD && (d.payment_split?.length ?? 0) > 1);

  const checks: [string, boolean][] = [
    ['имя клиента', !!d.client_name?.trim()],
    ['телефон', !!d.client_phone?.trim()],
    ['адрес', !!d.address?.trim()],
    ['№ договора', !!d.contract_number && /\d/.test(d.contract_number)],
    ['модель/товар', !!d.door_model?.trim()],
    ['сумма сделки', total > 0],
    ['дата сделки', !!d.deal_date],
  ];
  if (paid > 0) checks.push(['способ оплаты', validMethod]);
  if (d.amo_mismatch) checks.push([`совпадение с amoCRM (${d.amo_mismatch})`, false]);

  const missing = checks.filter(([, ok]) => !ok).map(([n]) => n);
  return { filled: checks.length - missing.length, total: checks.length, missing };
}

// Зелёный — только когда заполнено всё. Если чего-то не хватает,
// цвет идёт от красного (почти пусто) до жёлто-оранжевого (не хватает одного поля).
export function completenessColor(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  if (r >= 1) return 'hsl(135 65% 38%)';
  const hue = Math.round(r * 48);
  return `hsl(${hue} 85% 47%)`;
}

export default function DealCompleteness({ deal, showPercent = false, className = '' }: {
  deal: Deal; showPercent?: boolean; className?: string;
}) {
  const { filled, total, missing } = dealCompleteness(deal);
  const ratio = total ? filled / total : 1;
  const pct = Math.round(ratio * 100);
  const color = completenessColor(ratio);
  const title = missing.length === 0
    ? 'Сделка заполнена полностью'
    : `Заполнено ${filled} из ${total}. Не хватает: ${missing.join(', ')}`;
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 ${className}`} title={title} aria-label={title}>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}22` }} />
      {showPercent && <span className="text-[11px] font-medium tabular-nums" style={{ color }}>{pct}%</span>}
    </span>
  );
}
