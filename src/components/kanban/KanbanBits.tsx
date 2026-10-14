import React from 'react';
import { AlignLeft, MessageSquare, Paperclip, CheckSquare, Clock, MapPin, LayoutTemplate } from 'lucide-react';
import type { KCard, KLabel, KCustomField } from '@/lib/kanban';
import { labelHex, fieldDisplay } from '@/lib/kanban';
import type { Manager } from '@/types/types';

// Инициалы и цвет кружка участника
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
const AVATAR_COLORS = ['#1f6f5c', '#0c66e4', '#ae4787', '#b65c02', '#5e4db2', '#2c3e5d', '#c9372c', '#216e4e'];
export function avatarColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function Avatar({ m, size = 24 }: { m: Pick<Manager, 'id' | 'name'>; size?: number }) {
  return (
    <span title={m.name} className="inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0 ring-2 ring-card"
      style={{ width: size, height: size, fontSize: size * 0.4, background: avatarColor(m.id) }}>
      {initials(m.name)}
    </span>
  );
}

// Состояние срока: выполнено / просрочено / скоро / обычный
export function dueState(card: Pick<KCard, 'due_at' | 'due_done'>): 'done' | 'overdue' | 'soon' | 'normal' | null {
  if (!card.due_at) return null;
  if (card.due_done) return 'done';
  const t = new Date(card.due_at).getTime();
  const now = Date.now();
  if (t < now) return 'overdue';
  if (t - now < 24 * 3600 * 1000) return 'soon';
  return 'normal';
}
export function formatDue(iso: string, withTime = true): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const hasTime = !(d.getHours() === 23 && d.getMinutes() === 59);
  return withTime && hasTime ? `${date}, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : date;
}
export const DUE_STYLE: Record<string, string> = {
  done: 'bg-green-600 text-white',
  overdue: 'bg-red-600 text-white',
  soon: 'bg-amber-400 text-amber-950',
  normal: 'bg-transparent text-muted-foreground',
};

/** Мини-карточка на доске — как в Trello: обложка, метки, название, значки, участники. */
export function CardTile({ card, labels, members, fields = [], onOpen, dragging }: {
  card: KCard; labels: KLabel[]; members: Manager[]; fields?: KCustomField[]; onOpen: () => void; dragging?: boolean;
}) {
  const shownFields = fields.filter(f => f.show_on_card && fieldDisplay(f, card.field_values?.[f.id]));
  const cardLabels = labels.filter(l => card.label_ids.includes(l.id));
  const cardMembers = members.filter(m => card.member_ids.includes(m.id));
  const ds = dueState(card);
  const checklistDone = card.checklist_total > 0 && card.checklist_done === card.checklist_total;
  const hasBadges = ds || card.description || card.address || card.comments || card.attachments || card.checklist_total || cardMembers.length;
  return (
    <div onClick={onOpen}
      className={`rounded-lg bg-card shadow-[0_1px_1px_rgba(9,30,66,.25)] hover:ring-2 hover:ring-primary/50 cursor-pointer overflow-hidden transition ${dragging ? 'opacity-40' : ''}`}>
      {card.cover_color && <div className="h-8" style={{ background: labelHex(card.cover_color) }} />}
      <div className="px-2.5 py-2 space-y-1.5">
        {cardLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cardLabels.map(l => (
              <span key={l.id} className="h-4 min-w-[40px] px-1.5 rounded text-[10px] leading-4 font-semibold text-black/75 truncate max-w-[120px]"
                style={{ background: labelHex(l.color) }} title={l.name}>{l.name}</span>
            ))}
          </div>
        )}
        {card.is_template && <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary"><LayoutTemplate size={11} />Шаблон</div>}
        <div className="text-sm leading-snug break-words">{card.title}</div>
        {shownFields.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {shownFields.map(f => {
              const opt = f.type === 'select' ? f.options.find(o => o.id === card.field_values[f.id]) : null;
              return (
                <span key={f.id} className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-foreground/80 max-w-full truncate"
                  style={opt ? { background: labelHex(opt.color), color: 'rgba(0,0,0,.75)' } : undefined}>
                  {f.type === 'checkbox' ? `✓ ${f.name}` : `${f.name}: ${fieldDisplay(f, card.field_values[f.id])}`}
                </span>
              );
            })}
          </div>
        )}
        {hasBadges ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {ds && card.due_at && (
                <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 ${DUE_STYLE[ds]}`}>
                  <Clock size={11} />{formatDue(card.due_at, false)}
                </span>
              )}
              {card.description && <AlignLeft size={12} aria-label="Есть описание" />}
              {card.address && <MapPin size={12} aria-label="Есть адрес" />}
              {card.comments > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare size={11} />{card.comments}</span>}
              {card.attachments > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={11} />{card.attachments}</span>}
              {card.checklist_total > 0 && (
                <span className={`inline-flex items-center gap-0.5 rounded px-1 ${checklistDone ? 'bg-green-600 text-white' : ''}`}>
                  <CheckSquare size={11} />{card.checklist_done}/{card.checklist_total}
                </span>
              )}
            </div>
            {cardMembers.length > 0 && (
              <div className="flex -space-x-1.5 shrink-0">{cardMembers.slice(0, 3).map(m => <Avatar key={m.id} m={m} size={22} />)}</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
