import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Manager } from '@/types/types';
import { fieldDisplay, labelHex, type KCard, type KCustomField, type KLabel, type KList } from '@/lib/kanban';
import { Avatar, dueState, DUE_STYLE, formatDue } from '../KanbanBits';

type SortKey = 'title' | 'list' | 'due' | 'created' | `f:${string}`;

/** Вид «Таблица»: все карточки доски строками, сортировка по столбцам, выгрузка в Excel. */
export default function TableView({ boardTitle, lists, cards, labels, managers, fields, onOpen }: {
  boardTitle: string; lists: KList[]; cards: KCard[]; labels: KLabel[]; managers: Manager[]; fields: KCustomField[];
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'list', dir: 1 });
  const listIdx = useMemo(() => new Map(lists.map((l, i) => [l.id, i])), [lists]);
  const listTitle = (id: string) => lists.find(l => l.id === id)?.title ?? '';

  const rows = useMemo(() => {
    const val = (c: KCard): string | number => {
      if (sort.key === 'title') return c.title.toLowerCase();
      if (sort.key === 'list') return (listIdx.get(c.list_id) ?? 999) * 1e6 + c.position / 1e3;
      if (sort.key === 'due') return c.due_at ?? '9999';
      if (sort.key === 'created') return c.created_at;
      const f = fields.find(x => `f:${x.id}` === sort.key);
      const raw = f ? c.field_values[f.id] ?? '' : '';
      return f?.type === 'number' ? Number(raw || -Infinity) : raw;
    };
    return [...cards].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [cards, sort, fields, listIdx]);

  const th = (key: SortKey, label: string, cls = '') => (
    <th key={key} className={`px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none ${cls}`}
      onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown size={11} className={sort.key === key ? 'text-foreground' : 'opacity-40'} /></span>
    </th>
  );

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const data = rows.map(c => {
      const r: Record<string, string> = {
        'Карточка': c.title,
        'Колонка': listTitle(c.list_id),
        'Метки': labels.filter(l => c.label_ids.includes(l.id)).map(l => l.name).join(', '),
        'Участники': managers.filter(m => c.member_ids.includes(m.id)).map(m => m.name).join(', '),
        'Начало': c.start_at ? new Date(c.start_at).toLocaleDateString('ru-RU') : '',
        'Срок': c.due_at ? new Date(c.due_at).toLocaleString('ru-RU') : '',
        'Выполнено': c.due_done ? 'да' : '',
        'Чек-лист': c.checklist_total ? `${c.checklist_done}/${c.checklist_total}` : '',
        'Адрес': c.address ?? '',
        'Описание': c.description ?? '',
      };
      for (const f of fields) r[f.name] = fieldDisplay(f, c.field_values[f.id]);
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Карточки');
    XLSX.writeFile(wb, `${boardTitle.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`);
  }

  return (
    <div className="h-full overflow-auto p-3 md:p-4">
      <div className="rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">{rows.length} карточек</span>
          <Button size="sm" variant="outline" className="h-8" onClick={exportXlsx}><Download size={13} className="mr-1.5" />Выгрузить в Excel</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {th('title', 'Карточка', 'min-w-[220px]')}
                {th('list', 'Колонка')}
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Метки</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Участники</th>
                {th('due', 'Срок')}
                {fields.map(f => th(`f:${f.id}`, f.name))}
                {th('created', 'Создана')}
              </tr>
            </thead>
            <tbody>
              {rows.map(c => {
                const ds = dueState(c);
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => onOpen(c.id)}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.title}</div>
                      {c.checklist_total > 0 && <div className="text-[11px] text-muted-foreground">чек-лист {c.checklist_done}/{c.checklist_total}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{listTitle(c.list_id)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {labels.filter(l => c.label_ids.includes(l.id)).map(l => (
                          <span key={l.id} className="text-[10px] font-semibold rounded px-1.5 py-0.5 text-black/75" style={{ background: labelHex(l.color) }}>{l.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2"><div className="flex -space-x-1.5">{managers.filter(m => c.member_ids.includes(m.id)).map(m => <Avatar key={m.id} m={m} size={22} />)}</div></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {c.due_at && <span className={`text-xs rounded px-1.5 py-0.5 ${ds && ds !== 'normal' ? DUE_STYLE[ds] : ''}`}>{formatDue(c.due_at)}</span>}
                    </td>
                    {fields.map(f => <td key={f.id} className="px-3 py-2 whitespace-nowrap">{fieldDisplay(f, c.field_values[f.id])}</td>)}
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">{new Date(c.created_at).toLocaleDateString('ru-RU')}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6 + fields.length} className="px-3 py-10 text-center text-muted-foreground">Нет карточек</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
