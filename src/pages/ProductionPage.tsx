import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, Calendar, ExternalLink } from 'lucide-react';
import { supabase } from '@/db/supabase';

interface TrelloLabel { name: string; color: string; }
interface TrelloCard {
  id: string; name: string; desc: string; due: string | null;
  dateLastActivity: string; url: string; labels: TrelloLabel[];
}
interface TrelloList { id: string; name: string; cards: TrelloCard[]; isPlanned?: boolean; }

// Этапы, которых пока нет в реальной Trello — показываем как пустые
// заготовки на будущее, ничего не меняя в самой доске. Вставляются рядом
// с существующими этапами, где по логике должны быть.
const PLANNED_STAGES: { name: string; afterList?: string; beforeList?: string }[] = [
  { name: 'Заказ на фабрике', beforeList: 'В Пройзводстве' },
  { name: 'В пути (на склад)', afterList: 'В Пройзводстве' },
  { name: 'Контроль при приёмке', afterList: 'Склад Шымкент' },
];

function withPlannedStages(realLists: TrelloList[]): TrelloList[] {
  const result = [...realLists];
  for (const stage of PLANNED_STAGES) {
    const placeholder: TrelloList = { id: `planned-${stage.name}`, name: stage.name, cards: [], isPlanned: true };
    let idx = stage.beforeList ? result.findIndex(l => l.name === stage.beforeList) : -1;
    if (idx === -1 && stage.afterList) {
      const afterIdx = result.findIndex(l => l.name === stage.afterList);
      idx = afterIdx === -1 ? result.length : afterIdx + 1;
    }
    if (idx === -1) idx = result.length;
    result.splice(idx, 0, placeholder);
  }
  return result;
}

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

export default function ProductionPage() {
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('trello-board-read', {
        method: 'GET',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.error || res.data?.error) {
        setError(res.data?.error ?? res.error?.message ?? 'Ошибка загрузки');
        setLists([]);
      } else {
        setLists(withPlannedStages(res.data?.lists ?? []));
      }
    } catch {
      setError('Не удалось связаться с Trello');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filteredLists = q
    ? lists.map(l => ({ ...l, cards: l.cards.filter(c => c.name.toLowerCase().includes(q)) }))
    : lists;
  const nonEmptyLists = filteredLists.filter(l => l.cards.length > 0 || !q || l.isPlanned);
  const totalCards = lists.reduce((s, l) => s + l.cards.length, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Производство</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Доска «Продажа Otau Mart ProfilDoors» из Trello — без захода туда ({totalCards} карточек)
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
          <div className="flex gap-4 overflow-x-auto pb-4">
            {nonEmptyLists.map(list => (
              <div key={list.id} className={`shrink-0 w-80 ${list.isPlanned ? 'opacity-70' : ''}`}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    {list.name}
                    {list.isPlanned && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-dashed border-border">
                        заготовка
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-muted-foreground">{list.cards.length}</span>
                </div>
                <div className={`space-y-2 rounded-lg ${list.isPlanned ? 'border-2 border-dashed border-border min-h-16 p-2' : ''}`}>
                  {list.cards.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1">
                      {list.isPlanned ? 'Пока не используется — этап на будущее' : 'Пусто'}
                    </p>
                  ) : list.cards.map(card => (
                    <a
                      key={card.id}
                      href={card.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-border bg-background p-3 hover:border-primary/40 hover:shadow-sm transition-all"
                    >
                      {card.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {card.labels.map((lb, i) => (
                            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${labelClass(lb.color)}`}>
                              {lb.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs leading-snug">{card.name}</p>
                      <div className="flex items-center justify-between mt-2">
                        {card.due ? (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar size={10} />{formatDate(card.due)}
                          </span>
                        ) : <span />}
                        <ExternalLink size={10} className="text-muted-foreground" />
                      </div>
                    </a>
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
