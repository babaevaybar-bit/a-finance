import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Manager } from '@/types/types';
import { labelHex, type KCard, type KLabel, type KList } from '@/lib/kanban';
import { dueState } from '../KanbanBits';

function ChartCard({ title, data, colorOf }: { title: string; data: { name: string; value: number; color?: string }[]; colorOf?: (i: number) => string }) {
  const h = Math.max(160, data.length * 34 + 30);
  return (
    <div className="rounded-xl bg-card shadow-sm p-4 space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      {data.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">Нет данных</div> : (
        <ResponsiveContainer width="100%" height={h}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip formatter={(v: number) => [`${v} карт.`, '']} cursor={{ fill: 'hsl(var(--muted))' }} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
              {data.map((d, i) => <Cell key={d.name} fill={d.color ?? colorOf?.(i) ?? 'hsl(var(--primary))'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Вид «Дашборд»: сколько карточек в колонках, у кого, по меткам и срокам. */
export default function DashboardView({ lists, cards, labels, managers }: {
  lists: KList[]; cards: KCard[]; labels: KLabel[]; managers: Manager[];
}) {
  const stats = useMemo(() => {
    const due = { overdue: 0, soon: 0, done: 0, normal: 0, none: 0 };
    for (const c of cards) { const s = dueState(c); if (s) due[s] += 1; else due.none += 1; }
    return {
      byList: lists.map(l => ({ name: l.title, value: cards.filter(c => c.list_id === l.id).length, color: l.color ? labelHex(l.color) : undefined })),
      byMember: [
        ...managers.map(m => ({ name: m.name, value: cards.filter(c => c.member_ids.includes(m.id)).length })).filter(x => x.value > 0),
        { name: 'Без участника', value: cards.filter(c => c.member_ids.length === 0).length },
      ].filter(x => x.value > 0).sort((a, b) => b.value - a.value),
      byLabel: labels.map(l => ({ name: l.name || '—', value: cards.filter(c => c.label_ids.includes(l.id)).length, color: labelHex(l.color) })).filter(x => x.value > 0),
      due,
      checklist: cards.reduce((a, c) => ({ t: a.t + c.checklist_total, d: a.d + c.checklist_done }), { t: 0, d: 0 }),
    };
  }, [lists, cards, labels, managers]);

  const tiles = [
    { label: 'Всего карточек', value: cards.length, cls: '' },
    { label: 'Просрочено', value: stats.due.overdue, cls: 'text-red-600' },
    { label: 'Срок в ближайшие 24 ч', value: stats.due.soon, cls: 'text-amber-600' },
    { label: 'Выполнено в срок', value: stats.due.done, cls: 'text-green-700' },
    { label: 'Пункты чек-листов', value: stats.checklist.t ? `${stats.checklist.d}/${stats.checklist.t}` : '—', cls: '' },
  ];
  return (
    <div className="h-full overflow-auto p-3 md:p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="rounded-xl bg-card shadow-sm p-3.5">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className={`text-2xl font-semibold tabular-nums mt-1 ${t.cls}`}>{t.value}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <ChartCard title="Карточек в колонках" data={stats.byList} />
        <ChartCard title="Карточек у сотрудников" data={stats.byMember} />
        <ChartCard title="Карточек по меткам" data={stats.byLabel} />
        <ChartCard title="Сроки" data={[
          { name: 'Просрочено', value: stats.due.overdue, color: '#dc2626' },
          { name: 'Ближайшие 24 ч', value: stats.due.soon, color: '#e2b203' },
          { name: 'Впереди', value: stats.due.normal, color: '#579dff' },
          { name: 'Выполнено', value: stats.due.done, color: '#16a34a' },
          { name: 'Без срока', value: stats.due.none, color: '#8590a2' },
        ]} />
      </div>
    </div>
  );
}
