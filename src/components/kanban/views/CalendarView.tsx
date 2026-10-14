import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { labelHex, type KCard, type KList } from '@/lib/kanban';

export interface CalendarItem { id: string; title: string; due_at: string | null; due_done: boolean; color: string | null; sub?: string }

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Сетка месяца: карточки по сроку, перетаскивание на другой день меняет срок. */
export function MonthCalendar({ items, onOpen, onMove, readOnly }: {
  items: CalendarItem[]; onOpen: (id: string) => void; onMove?: (id: string, newDueIso: string) => void; readOnly?: boolean;
}) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const dragId = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // понедельник — первый день
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) {
      if (!it.due_at) continue;
      const k = dayKey(new Date(it.due_at));
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return m;
  }, [items]);
  const todayKey = dayKey(new Date());
  const noDue = items.filter(i => !i.due_at).length;

  function drop(d: Date) {
    const id = dragId.current; dragId.current = null; setOver(null);
    if (!id || !onMove) return;
    const it = items.find(x => x.id === id);
    const prev = it?.due_at ? new Date(it.due_at) : null;
    const nd = new Date(d); nd.setHours(prev ? prev.getHours() : 18, prev ? prev.getMinutes() : 0, 0, 0);
    onMove(id, nd.toISOString());
  }

  return (
    <div className="h-full flex flex-col rounded-xl bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Предыдущий месяц"><ChevronLeft size={16} /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Следующий месяц"><ChevronRight size={16} /></Button>
        <Button size="sm" variant="outline" className="h-8" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Сегодня</Button>
        <span className="font-semibold capitalize ml-1">{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
        {noDue > 0 && <span className="ml-auto text-xs text-muted-foreground">Без срока: {noDue}</span>}
      </div>
      <div className="grid grid-cols-7 text-xs text-muted-foreground border-b border-border">
        {WEEKDAYS.map(w => <div key={w} className="px-2 py-1.5">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-[480px]">
        {days.map(d => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === month.getMonth();
          const list = byDay.get(k) ?? [];
          return (
            <div key={k}
              className={`border-b border-r border-border p-1 min-h-0 overflow-y-auto ${inMonth ? '' : 'bg-muted/30'} ${over === k ? 'bg-primary/10' : ''}`}
              onDragOver={e => { if (dragId.current && !readOnly) { e.preventDefault(); if (over !== k) setOver(k); } }}
              onDragLeave={() => setOver(o => (o === k ? null : o))}
              onDrop={e => { e.preventDefault(); drop(d); }}>
              <div className={`text-[11px] mb-1 w-6 h-6 flex items-center justify-center rounded-full ${k === todayKey ? 'bg-primary text-primary-foreground font-semibold' : inMonth ? '' : 'text-muted-foreground'}`}>{d.getDate()}</div>
              <div className="space-y-1">
                {list.map(it => (
                  <button key={it.id} type="button" draggable={!readOnly}
                    onDragStart={() => { dragId.current = it.id; }}
                    onClick={() => onOpen(it.id)}
                    className={`w-full text-left text-[11px] leading-tight rounded px-1.5 py-1 truncate border-l-[3px] bg-muted/60 hover:bg-muted ${it.due_done ? 'line-through opacity-60' : ''}`}
                    style={{ borderLeftColor: it.color ? labelHex(it.color) : 'hsl(var(--primary))' }}
                    title={it.sub ? `${it.title} — ${it.sub}` : it.title}>
                    {it.title}{it.sub ? <span className="block text-muted-foreground truncate">{it.sub}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Вид «Календарь» на доске. */
export default function CalendarView({ lists, cards, onOpen, onMove, readOnly }: {
  lists: KList[]; cards: KCard[]; onOpen: (id: string) => void; onMove: (id: string, dueIso: string) => void; readOnly?: boolean;
}) {
  const items: CalendarItem[] = cards.map(c => {
    const l = lists.find(x => x.id === c.list_id);
    return { id: c.id, title: c.title, due_at: c.due_at, due_done: c.due_done, color: c.cover_color ?? l?.color ?? null, sub: l?.title };
  });
  return <div className="h-full p-3 md:p-4"><MonthCalendar items={items} onOpen={onOpen} onMove={onMove} readOnly={readOnly} /></div>;
}
