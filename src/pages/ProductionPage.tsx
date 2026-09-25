import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, Calendar, ExternalLink, RotateCcw, GripVertical } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { getProductionOverrides, setProductionOverride, clearProductionOverride } from '@/lib/api';

interface TrelloLabel { name: string; color: string; }
interface TrelloCard {
  id: string; name: string; desc: string; due: string | null;
  dateLastActivity: string; url: string; labels: TrelloLabel[];
}
interface TrelloList { id: string; name: string; cards: TrelloCard[]; }

const PLANNED_STAGES: { name: string; afterList?: string; beforeList?: string }[] = [
  { name: 'Заказ на фабрике', beforeList: 'В Пройзводстве' },
  { name: 'В пути (на склад)', afterList: 'В Пройзводстве' },
  { name: 'Контроль при приёмке', afterList: 'Склад Шымкент' },
];

const LABEL_COLOR_MAP: Record<string, string> = {
  green: 'bg-green-100 text-green-800', yellow: 'bg-yellow-100 text-yellow-800',
  orange: 'bg-orange-100 text-orange-800', red: 'bg-red-100 text-red-800',
  purple: 'bg-purple-100 text-purple-800', blue: 'bg-blue-100 text-blue-800',
  sky: 'bg-sky-100 text-sky-800', lime: 'bg-lime-100 text-lime-800',
  pink: 'bg-pink-100 text-pink-800', black: 'bg-slate-200 text-slate-800',
  red_light: 'bg-red-50 text-red-700', red_dark: 'bg-red-200 text-red-900',
  yellow_dark: 'bg-yellow-200 text-yellow-900', sky_dark: 'bg-sky-200 text-sky-900',
  lime_dark: 'bg-lime-200 text-lime-900',
};
function labelClass(color: string) {
  return LABEL_COLOR_MAP[color] ?? 'bg-muted text-muted-foreground';
}
function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

interface PlacedCard extends TrelloCard {
  realStage: string;
  effectiveStage: string;
  isOverridden: boolean;
}
interface Column { name: string; isPlanned: boolean; cards: PlacedCard[]; }

export default function ProductionPage() {
  const [rawLists, setRawLists] = useState<TrelloList[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const draggedCardId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const [boardRes, overridesRes] = await Promise.all([
        supabase.functions.invoke('trello-board-read', {
          method: 'GET',
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        }),
        getProductionOverrides().catch(() => []),
      ]);
      if (boardRes.error || boardRes.data?.error) {
        setError(boardRes.data?.error ?? boardRes.error?.message ?? 'Ошибка загрузки');
        setRawLists([]);
      } else {
        setRawLists(boardRes.data?.lists ?? []);
      }
      setOverrides(Object.fromEntries(overridesRes.map(o => [o.trello_card_id, o.overridden_stage])));
    } catch {
      setError('Не удалось связаться с Trello');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const columnOrder = useMemo(() => {
    const order = rawLists.map(l => l.name);
    for (const stage of PLANNED_STAGES) {
      let idx = stage.beforeList ? order.indexOf(stage.beforeList) : -1;
      if (idx === -1 && stage.afterList) {
        const afterIdx = order.indexOf(stage.afterList);
        idx = afterIdx === -1 ? order.length : afterIdx + 1;
      }
      if (idx === -1) idx = order.length;
      order.splice(idx, 0, stage.name);
    }
    return order;
  }, [rawLists]);

  const columns: Column[] = useMemo(() => {
    const byName = new Map<string, Column>(
      columnOrder.map(name => [name, { name, isPlanned: PLANNED_STAGES.some(p => p.name === name), cards: [] }])
    );
    for (const list of rawLists) {
      for (const card of list.cards) {
        const override = overrides[card.id];
        const effectiveStage = override ?? list.name;
        const placed: PlacedCard = { ...card, realStage: list.name, effectiveStage, isOverridden: !!override };
        const col = byName.get(effectiveStage);
        if (col) col.cards.push(placed);
      }
    }
    return columnOrder.map(name => byName.get(name)!);
  }, [rawLists, overrides, columnOrder]);

  const q = search.trim().toLowerCase();
  const visibleColumns = columns
    .map(col => ({ ...col, cards: q ? col.cards.filter(c => c.name.toLowerCase().includes(q)) : col.cards }))
    .filter(col => col.cards.length > 0 || !q || col.isPlanned);
  const totalCards = columns.reduce((s, c) => s + c.cards.length, 0);

  async function handleDrop(columnName: string) {
    setDragOverColumn(null);
    const cardId = draggedCardId.current;
    draggedCardId.current = null;
    if (!cardId) return;
    const card = columns.flatMap(c => c.cards).find(c => c.id === cardId);
    if (!card || card.effectiveStage === columnName) return;
    try {
      if (columnName === card.realStage) {
        await clearProductionOverride(cardId);
      } else {
        await setProductionOverride(cardId, columnName);
      }
      setOverrides(prev => {
        const next = { ...prev };
        if (columnName === card.realStage) delete next[cardId];
        else next[cardId] = columnName;
        return next;
      });
    } catch {
      /* тихо игнорируем — при следующей загрузке подтянется актуальное */
    }
  }

  async function handleReset(card: PlacedCard) {
    try {
      await clearProductionOverride(card.id);
      setOverrides(prev => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
    } catch { /* silent */ }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Производство</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Доска «Продажа Otau Mart ProfilDoors» — без захода в Trello ({totalCards} карточек).
              Перетаскивание карточек сохраняется только у нас, саму Trello не меняет.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по клиенту" className="h-9 pl-7 w-56" />
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Загрузка...</div>
        ) : !error && (
          <div className="flex gap-3 overflow-x-auto pb-4 items-start">
            {visibleColumns.map(col => (
              <div
                key={col.name}
                className={`shrink-0 w-72 rounded-xl transition-colors ${
                  dragOverColumn === col.name ? 'bg-primary/5 ring-2 ring-primary/40' : col.isPlanned ? 'bg-muted/20' : 'bg-muted/40'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOverColumn(col.name); }}
                onDragLeave={() => setDragOverColumn(prev => (prev === col.name ? null : prev))}
                onDrop={e => { e.preventDefault(); handleDrop(col.name); }}
              >
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{col.name}</span>
                    {col.isPlanned && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background text-muted-foreground border border-dashed border-border shrink-0">
                        заготовка
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5 shrink-0">{col.cards.length}</span>
                </div>

                <div className={`space-y-2 px-3 pb-3 min-h-24 ${col.isPlanned && col.cards.length === 0 ? 'border-2 border-dashed border-border/70 rounded-lg mx-3 mb-3 mt-0' : ''}`}>
                  {col.cards.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1 py-2">
                      {col.isPlanned ? 'Пока не используется — этап на будущее' : 'Пусто'}
                    </p>
                  ) : col.cards.map(card => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => { draggedCardId.current = card.id; }}
                      onDragEnd={() => { draggedCardId.current = null; setDragOverColumn(null); }}
                      className="group rounded-lg border border-border bg-background p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing"
                    >
                      {card.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {card.labels.map((lb, i) => (
                            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${labelClass(lb.color)}`}>
                              {lb.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs leading-snug">{card.name}</p>
                      {card.isOverridden && (
                        <button
                          type="button"
                          onClick={() => handleReset(card)}
                          className="mt-1.5 text-[10px] text-primary flex items-center gap-1 hover:underline"
                          title={`На самом деле в Trello: «${card.realStage}»`}
                        >
                          <RotateCcw size={10} />перемещено у нас — вернуть как в Trello
                        </button>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        {card.due ? (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar size={10} />{formatDate(card.due)}
                          </span>
                        ) : <span />}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <GripVertical size={11} className="text-muted-foreground" />
                          <a href={card.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                            <ExternalLink size={11} className="text-muted-foreground hover:text-primary" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
