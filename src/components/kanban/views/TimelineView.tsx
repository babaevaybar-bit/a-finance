import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { labelHex, type KCard, type KList } from '@/lib/kanban';

const DAY = 86400000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const toDateOnly = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Вид «Таймлайн» (диаграмма Ганта): полоса карточки — от «Начала» до «Срока».
 * Полосу можно перетащить вправо/влево — сдвигаются обе даты.
 */
export default function TimelineView({ lists, cards, onOpen, onShift, readOnly }: {
  lists: KList[]; cards: KCard[]; onOpen: (id: string) => void;
  onShift: (id: string, startDate: string | null, dueIso: string | null) => void; readOnly?: boolean;
}) {
  const [zoom, setZoom] = useState<'week' | 'month'>('month');
  const dayW = zoom === 'week' ? 64 : 28;
  const span = zoom === 'week' ? 21 : 56;
  const [from, setFrom] = useState(() => startOfDay(new Date(Date.now() - 7 * DAY)));
  const days = useMemo(() => Array.from({ length: span }, (_, i) => new Date(from.getTime() + i * DAY)), [from, span]);
  const drag = useRef<{ id: string; x: number } | null>(null);
  const [dx, setDx] = useState<{ id: string; px: number } | null>(null);

  const dated = cards.filter(c => c.due_at || c.start_at);
  const undated = cards.filter(c => !c.due_at && !c.start_at);
  const todayX = Math.round((startOfDay(new Date()).getTime() - from.getTime()) / DAY) * dayW;

  function range(c: KCard) {
    const end = c.due_at ? startOfDay(new Date(c.due_at)) : new Date(c.start_at + 'T00:00:00');
    const start = c.start_at ? new Date(c.start_at + 'T00:00:00') : end;
    const s = Math.round((start.getTime() - from.getTime()) / DAY);
    const e = Math.round((end.getTime() - from.getTime()) / DAY);
    return { s: Math.min(s, e), e: Math.max(s, e) };
  }

  function onPointerUp(c: KCard) {
    const d = drag.current; drag.current = null;
    const moved = dx?.id === c.id ? dx.px : 0; setDx(null);
    if (!d) return;
    const shift = Math.round(moved / dayW);
    if (shift === 0) { onOpen(c.id); return; }
    const ns = c.start_at ? toDateOnly(new Date(new Date(c.start_at + 'T00:00:00').getTime() + shift * DAY)) : null;
    const nd = c.due_at ? new Date(new Date(c.due_at).getTime() + shift * DAY).toISOString() : null;
    onShift(c.id, ns, nd);
  }

  return (
    <div className="h-full p-3 md:p-4">
      <div className="h-full flex flex-col rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFrom(f => new Date(f.getTime() - 7 * DAY))} aria-label="Раньше"><ChevronLeft size={16} /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFrom(f => new Date(f.getTime() + 7 * DAY))} aria-label="Позже"><ChevronRight size={16} /></Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setFrom(startOfDay(new Date(Date.now() - 7 * DAY)))}>Сегодня</Button>
          <div className="flex rounded-md border border-border p-0.5 ml-1">
            {(['week', 'month'] as const).map(z => (
              <button key={z} type="button" onClick={() => setZoom(z)} className={`text-xs px-2.5 py-1 rounded ${zoom === z ? 'bg-primary text-primary-foreground' : ''}`}>{z === 'week' ? 'Недели' : 'Месяц'}</button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-auto">Полосу можно перетащить, чтобы сдвинуть даты{undated.length ? ` · без дат: ${undated.length}` : ''}</span>
        </div>
        <div className="flex-1 overflow-auto">
          <div style={{ width: 200 + span * dayW }} className="relative">
            {/* шкала дат */}
            <div className="sticky top-0 z-10 flex bg-card border-b border-border">
              <div className="w-[200px] shrink-0 px-3 py-1.5 text-xs text-muted-foreground border-r border-border">Колонка / карточка</div>
              {days.map(d => (
                <div key={d.getTime()} style={{ width: dayW }} className={`shrink-0 text-center text-[10px] py-1.5 border-r border-border/50 ${[0, 6].includes(d.getDay()) ? 'bg-muted/40' : ''}`}>
                  <div className="text-muted-foreground">{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</div>
                  <div className="font-medium">{d.getDate()}{d.getDate() === 1 || d.getTime() === from.getTime() ? ` ${d.toLocaleDateString('ru-RU', { month: 'short' })}` : ''}</div>
                </div>
              ))}
            </div>
            {todayX >= 0 && todayX < span * dayW && <div className="absolute top-0 bottom-0 w-px bg-red-500/70 z-[5]" style={{ left: 200 + todayX + dayW / 2 }} />}
            {lists.map(l => {
              const rows = dated.filter(c => c.list_id === l.id);
              if (!rows.length) return null;
              return (
                <div key={l.id}>
                  <div className="flex border-b border-border bg-muted/30">
                    <div className="w-[200px] shrink-0 px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                      {l.color && <span className="w-2 h-2 rounded-full" style={{ background: labelHex(l.color) }} />}{l.title} <span className="text-muted-foreground font-normal">({rows.length})</span>
                    </div>
                  </div>
                  {rows.map(c => {
                    const { s, e } = range(c);
                    const left = s * dayW + (dx?.id === c.id ? dx.px : 0);
                    const width = (e - s + 1) * dayW - 4;
                    const color = c.cover_color ? labelHex(c.cover_color) : l.color ? labelHex(l.color) : 'hsl(var(--primary))';
                    return (
                      <div key={c.id} className="flex border-b border-border/60 h-9 items-center">
                        <button type="button" className="w-[200px] shrink-0 px-3 text-xs truncate text-left hover:underline" onClick={() => onOpen(c.id)}>{c.title}</button>
                        <div className="relative flex-1 h-full">
                          <div
                            className={`absolute top-1.5 h-6 rounded-md text-[11px] text-white px-2 leading-6 truncate shadow-sm ${readOnly ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${c.due_done ? 'opacity-60' : ''}`}
                            style={{ left: left + 2, width: Math.max(width, 18), background: color }}
                            onPointerDown={e => { if (readOnly) { onOpen(c.id); return; } (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { id: c.id, x: e.clientX }; setDx({ id: c.id, px: 0 }); }}
                            onPointerMove={e => { if (drag.current?.id === c.id) setDx({ id: c.id, px: e.clientX - drag.current.x }); }}
                            onPointerUp={() => onPointerUp(c)}
                            title={c.title}>
                            {c.title}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {dated.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">У карточек пока нет дат. Откройте карточку → «Даты», чтобы она появилась на таймлайне.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
