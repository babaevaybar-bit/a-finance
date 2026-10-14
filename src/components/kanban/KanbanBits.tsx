import React from 'react';
import { AlignLeft, MessageSquare, Paperclip, CheckSquare, Clock, MapPin, LayoutTemplate, Check, Archive, Pencil } from 'lucide-react';
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
// Срок по-человечески: «сегодня 18:00», «завтра», «просрочено 2 дн.», «20 окт.»
export function relativeDue(iso: string, done = false): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date())) / 86400000);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (done) return formatDue(iso, false);
  if (diff < -1) return `просрочено ${-diff} дн.`;
  if (diff === -1) return 'вчера';
  if (diff === 0) return d.getTime() < Date.now() ? `сегодня, было в ${time}` : `сегодня ${time}`;
  if (diff === 1) return 'завтра';
  if (diff < 7) return d.toLocaleDateString('ru-RU', { weekday: 'long' });
  return formatDue(iso, false);
}
export const DUE_STYLE: Record<string, string> = {
  done: 'bg-green-600 text-white',
  overdue: 'bg-red-600 text-white',
  soon: 'bg-amber-400 text-amber-950',
  normal: 'bg-transparent text-muted-foreground',
};

/** Мини-карточка на доске — как в Trello, плюс быстрые действия при наведении. */
export function CardTile({ card, labels, members, fields = [], onOpen, dragging, onToggleDue, onArchive, onToggleMemberFilter }: {
  card: KCard; labels: KLabel[]; members: Manager[]; fields?: KCustomField[]; onOpen: () => void; dragging?: boolean;
  onToggleDue?: () => void; onArchive?: () => void; onToggleMemberFilter?: (id: string) => void;
}) {
  const shownFields = fields.filter(f => f.show_on_card && fieldDisplay(f, card.field_values?.[f.id]));
  const cardLabels = labels.filter(l => card.label_ids.includes(l.id));
  const cardMembers = members.filter(m => card.member_ids.includes(m.id));
  const ds = dueState(card);
  const checklistDone = card.checklist_total > 0 && card.checklist_done === card.checklist_total;
  const hasBadges = ds || card.description || card.address || card.comments || card.attachments || card.checklist_total || cardMembers.length;
  const stop = (fn?: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn?.(); };
  return (
    <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
      className={`group/card relative rounded-[10px] bg-card shadow-[0_1px_0_rgba(9,30,66,.18),0_1px_3px_rgba(9,30,66,.08)] cursor-pointer overflow-hidden
        transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[0_6px_14px_-6px_rgba(9,30,66,.35)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${dragging ? 'opacity-40 rotate-1' : ''} ${card.due_done ? 'opacity-80' : ''}`}>
      {card.cover_color && <div className="h-9" style={{ background: labelHex(card.cover_color) }} />}

      {/* быстрые действия */}
      {(onToggleDue || onArchive) && (
        <div className="absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity">
          <button type="button" title="Открыть" onClick={stop(onOpen)} className="h-7 w-7 rounded-md bg-card/95 shadow-sm flex items-center justify-center hover:bg-muted"><Pencil size={13} /></button>
          {card.due_at && onToggleDue && (
            <button type="button" title={card.due_done ? 'Снять отметку «выполнено»' : 'Отметить выполненной'} onClick={stop(onToggleDue)}
              className={`h-7 w-7 rounded-md shadow-sm flex items-center justify-center ${card.due_done ? 'bg-green-600 text-white' : 'bg-card/95 hover:bg-green-50 hover:text-green-700'}`}><Check size={14} /></button>
          )}
          {onArchive && (
            <button type="button" title="В архив" onClick={stop(onArchive)} className="h-7 w-7 rounded-md bg-card/95 shadow-sm flex items-center justify-center hover:bg-muted"><Archive size={13} /></button>
          )}
        </div>
      )}

      <div className="px-3 py-2.5 space-y-1.5">
        {cardLabels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cardLabels.map(l => (
              <span key={l.id} className="h-[18px] min-w-[36px] px-1.5 rounded-[5px] text-[10.5px] leading-[18px] font-semibold text-black/75 truncate max-w-[130px]"
                style={{ background: labelHex(l.color) }} title={l.name}>{l.name}</span>
            ))}
          </div>
        )}
        {card.is_template && <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"><LayoutTemplate size={11} />Шаблон</div>}
        <div className={`text-[14px] leading-snug break-words pr-1 ${card.due_done ? 'line-through decoration-foreground/30' : ''}`}>{card.title}</div>
        {shownFields.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {shownFields.map(f => {
              const opt = f.type === 'select' ? f.options.find(o => o.id === card.field_values[f.id]) : null;
              return (
                <span key={f.id} className="text-[10.5px] rounded-[5px] px-1.5 py-0.5 bg-muted text-foreground/80 max-w-full truncate"
                  style={opt ? { background: labelHex(opt.color), color: 'rgba(0,0,0,.75)' } : undefined}>
                  {f.type === 'checkbox' ? `✓ ${f.name}` : <><span className="text-muted-foreground">{f.name}</span> {fieldDisplay(f, card.field_values[f.id])}</>}
                </span>
              );
            })}
          </div>
        )}
        {hasBadges ? (
          <div className="flex items-end justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted-foreground">
              {ds && card.due_at && (
                <button type="button" onClick={onToggleDue ? stop(onToggleDue) : undefined} title={onToggleDue ? 'Нажмите, чтобы отметить выполнение' : undefined}
                  className={`inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 ${ds === 'normal' ? 'bg-muted/70' : DUE_STYLE[ds]}`}>
                  {ds === 'done' ? <Check size={11} /> : <Clock size={11} />}{relativeDue(card.due_at, card.due_done)}
                </button>
              )}
              {card.description && <AlignLeft size={13} aria-label="Есть описание" />}
              {card.address && <MapPin size={13} aria-label="Есть адрес" />}
              {card.comments > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare size={12} />{card.comments}</span>}
              {card.attachments > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={12} />{card.attachments}</span>}
              {card.checklist_total > 0 && (
                <span className={`inline-flex items-center gap-0.5 rounded-[5px] px-1 ${checklistDone ? 'bg-green-600 text-white' : ''}`}>
                  <CheckSquare size={12} />{card.checklist_done}/{card.checklist_total}
                </span>
              )}
            </div>
            {cardMembers.length > 0 && (
              <div className="flex -space-x-1.5 shrink-0">
                {cardMembers.slice(0, 3).map(m => (
                  <span key={m.id} onClick={onToggleMemberFilter ? stop(() => onToggleMemberFilter(m.id)) : undefined} title={`${m.name} — показать только его карточки`}>
                    <Avatar m={m} size={24} />
                  </span>
                ))}
                {cardMembers.length > 3 && <span className="h-6 w-6 rounded-full bg-muted text-[10px] flex items-center justify-center ring-2 ring-card">+{cardMembers.length - 3}</span>}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
