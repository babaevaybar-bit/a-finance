import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Factory, ChevronDown, Clock, Trophy, Plus } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { formatCurrency } from '@/lib/utils';
import type { Deal, Manager } from '@/types/types';
import DealFormDialog from '@/components/sales/DealFormDialog';

/** Карточка производства, привязанная к сделке */
interface ProdCard { id: string; board_id: string; deal_id: string; list: string }

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const thisYear = () => Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Qyzylorda' }).slice(0, 4));

/**
 * «Успешные продажи» — купившие клиенты по годам и месяцам (как воронка «Успешные продажи 2026» в amoCRM).
 * Попадают после подтверждения сделки; до подтверждения видны с пометкой «ждёт подтверждения».
 * У каждой продажи — её карточка на доске производства (создаётся сама при подтверждении).
 */
export default function SuccessfulSales({ managers, mgrFilter, search }: { managers: Manager[]; mgrFilter: string; search: string }) {
  const navigate = useNavigate();
  const [year, setYear] = useState(thisYear());
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [cards, setCards] = useState<Record<string, ProdCard>>({});
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<Deal | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDeals(null);
    const { data, error } = await supabase.from('deals').select('*')
      .gte('month_year', `${year}-01`).lte('month_year', `${year}-12`).in('status', ['approved', 'pending'])
      .order('deal_date', { ascending: false }).limit(2000);
    if (error) { toast.error('Не удалось загрузить продажи'); setDeals([]); return; }
    const list = (data as Deal[]) ?? [];
    setDeals(list);
    const ids = list.map(d => d.id);
    const map: Record<string, ProdCard> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const { data: cs } = await supabase.from('kanban_cards').select('id, board_id, deal_id, kanban_lists(title)')
        .in('deal_id', ids.slice(i, i + 200)).eq('archived', false);
      for (const c of (cs as unknown as { id: string; board_id: string; deal_id: string; kanban_lists: { title: string } | null }[] | null) ?? [])
        map[c.deal_id] = { id: c.id, board_id: c.board_id, deal_id: c.deal_id, list: c.kanban_lists?.title ?? '' };
    }
    setCards(map);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const mName = (id: string) => managers.find(m => m.id === id)?.name ?? '';
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase(), digits = search.replace(/\D/g, '');
    return (deals ?? []).filter(d => (!mgrFilter || d.manager_id === mgrFilter)
      && (!s || (d.client_name ?? '').toLowerCase().includes(s) || (d.address ?? '').toLowerCase().includes(s)
        || (digits.length >= 3 && (d.client_phone ?? '').replace(/\D/g, '').includes(digits))));
  }, [deals, mgrFilter, search]);

  const byMonth = useMemo(() => {
    const m = new Map<string, Deal[]>();
    for (const d of shown) { const k = d.month_year; m.set(k, [...(m.get(k) ?? []), d]); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [shown]);
  const sum = (l: Deal[]) => l.reduce((a, d) => a + Number(d.total_amount || 0), 0);
  const paid = (l: Deal[]) => l.reduce((a, d) => a + Number(d.paid_amount || 0), 0);
  const approved = shown.filter(d => d.status === 'approved');

  async function makeCard(d: Deal) {
    setCreating(d.id);
    const { data, error } = await supabase.rpc('production_card_for_deal', { p_deal: d.id });
    setCreating(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Карточка в производстве создана');
    await load();
    const { data: c } = await supabase.from('kanban_cards').select('board_id').eq('id', data as string).maybeSingle();
    if (c) navigate(`/boards/${(c as { board_id: string }).board_id}?card=${data}`);
  }

  return (
    <div className="space-y-3 pb-24 md:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
          {[thisYear() - 1, thisYear()].map(y => (
            <button key={y} type="button" onClick={() => setYear(y)}
              className={`h-8 px-3 rounded-md text-sm ${year === y ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>{y}</button>
          ))}
        </div>
        {deals && (
          <div className="text-sm text-muted-foreground">
            Подтверждено <b className="text-foreground">{approved.length}</b> продаж на <b className="text-foreground">{formatCurrency(sum(approved))}</b>
            {shown.length > approved.length && <> · ждут подтверждения {shown.length - approved.length}</>}
          </div>
        )}
      </div>

      {deals === null ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : byMonth.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card py-10 text-center text-sm text-muted-foreground">
          <Trophy className="mx-auto mb-2 text-muted-foreground/60" size={22} />За {year} год продаж пока нет
        </div>
      ) : byMonth.map(([ym, list]) => {
        const [y, m] = ym.split('-').map(Number);
        const isClosed = closed[ym] ?? false;
        return (
          <section key={ym} className="rounded-xl border bg-card overflow-hidden">
            <button type="button" onClick={() => setClosed(c => ({ ...c, [ym]: !isClosed }))}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30">
              <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isClosed ? '-rotate-90' : ''}`} />
              <span className="font-semibold">{MONTHS[m - 1]} {y}</span>
              <span className="text-sm text-muted-foreground">{list.length} {list.length === 1 ? 'продажа' : list.length < 5 ? 'продажи' : 'продаж'}</span>
              <span className="ml-auto text-sm tabular-nums"><b>{formatCurrency(sum(list))}</b>
                <span className="text-muted-foreground hidden sm:inline"> · оплачено {formatCurrency(paid(list))}</span></span>
            </button>
            {!isClosed && (
              <div className="divide-y border-t">
                {list.map(d => {
                  const rest = Number(d.total_amount || 0) - Number(d.paid_amount || 0);
                  const card = cards[d.id];
                  return (
                    <div key={d.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 hover:bg-muted/20">
                      <button type="button" onClick={() => setEdit(d)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{d.client_name || 'Без имени'}</span>
                          {d.status === 'pending' && <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1"><Clock size={11} />ждёт подтверждения</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[new Date(d.deal_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }), mName(d.manager_id), d.door_model, d.address].filter(Boolean).join(' · ')}
                        </div>
                      </button>
                      <div className="flex items-center gap-3 sm:w-auto">
                        <div className="text-right tabular-nums text-sm">
                          <div className="font-semibold">{formatCurrency(Number(d.total_amount || 0))}</div>
                          <div className={`text-[11px] ${rest > 0 ? 'text-amber-700' : 'text-green-700'}`}>{rest > 0 ? `остаток ${formatCurrency(rest)}` : 'оплачено'}</div>
                        </div>
                        {card ? (
                          <button type="button" onClick={() => navigate(`/boards/${card.board_id}?card=${card.id}`)} title="Открыть карточку в производстве"
                            className="h-9 px-3 rounded-lg border text-xs inline-flex items-center gap-1.5 hover:bg-muted min-w-[132px] justify-center">
                            <Factory size={14} className="text-primary" /><span className="truncate max-w-[110px]">{card.list || 'Производство'}</span>
                          </button>
                        ) : d.status === 'approved' ? (
                          <button type="button" onClick={() => makeCard(d)} disabled={creating === d.id}
                            title={d.production_stage ? `В Trello: ${d.production_stage}` : 'Создать карточку на доске производства'}
                            className="h-9 px-3 rounded-lg border border-dashed text-xs inline-flex items-center gap-1.5 text-muted-foreground hover:bg-muted min-w-[132px] justify-center">
                            {creating === d.id ? 'Создаю…' : <><Plus size={13} />{d.production_stage ? `Trello: ${d.production_stage}` : 'В производство'}</>}
                          </button>
                        ) : (
                          <span className="h-9 px-3 text-[11px] text-muted-foreground inline-flex items-center min-w-[132px] justify-center">после подтверждения</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {edit && (
        <DealFormDialog open={!!edit} deal={edit} managerId={edit.manager_id} monthYear={edit.month_year}
          onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      )}
    </div>
  );
}
