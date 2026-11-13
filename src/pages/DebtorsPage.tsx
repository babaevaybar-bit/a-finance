import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, MessageCircle, Search, AlertTriangle, CalendarClock, Wallet, Factory } from 'lucide-react';
import { getAllDeals, getManagers } from '@/lib/api';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, Manager } from '@/types/types';
import DealPayments from '@/components/sales/DealPayments';
import DealFormDialog from '@/components/sales/DealFormDialog';
import { useAuth } from '@/contexts/AuthContext';
import DealCompleteness from '@/components/sales/DealCompleteness';
import { phoneKeys } from '@/lib/phone';
import ClientHistoryButton from '@/components/client/ClientHistoryButton';
import { effectiveDueDate, waitingForWarehouse, PAYMENT_TRIGGER_STAGE } from '@/lib/payments';

type Filter = 'all' | 'overdue' | 'week' | 'waiting';

function todayKz(): string {
  return new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}
function waLink(phone: string | null): string | null {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d.length === 11 ? `https://wa.me/${d}` : null;
}

/**
 * «Должники» — все подтверждённые сделки, по которым клиент ещё не заплатил всё.
 * Сверху итоги (весь долг, просрочено, на этой неделе), ниже — список, где
 * просроченные идут первыми. Можно позвонить, написать в WhatsApp и внести оплату.
 */
export default function DebtorsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [managerId, setManagerId] = useState<string>('all');
  // ?q= — переход из карточки клиента («Открыть в Должниках»)
  const location = useLocation();
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  useEffect(() => { const q = new URLSearchParams(location.search).get('q'); if (q != null) setSearch(q); }, [location.search]);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [lastPay, setLastPay] = useState<Map<string, { amount: number; date: string; n: number }>>(new Map());

  // «Доступ» → Должники: «Только свои» — только должники по своим сделкам
  const { profile, seesAll } = useAuth();
  const own = !seesAll('debtors');
  const myId = profile?.manager_id ?? null;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [d, m] = await Promise.all([getAllDeals(), getManagers()]);
      const mine = own ? d.filter(x => x.manager_id === myId) : d;
      setDeals(mine);
      setManagers(m);
      // последняя оплата по каждому должнику — для середины строки
      const ids = mine.filter(x => Number(x.total_amount) - Number(x.paid_amount) > 0).map(x => x.id);
      const lp = new Map<string, { amount: number; date: string; n: number }>();
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase.from('deal_payments').select('deal_id, amount, payment_date').in('deal_id', ids.slice(i, i + 150)).order('payment_date', { ascending: true });
        for (const p of (data ?? []) as { deal_id: string; amount: number; payment_date: string }[]) {
          const cur = lp.get(p.deal_id);
          lp.set(p.deal_id, { amount: Number(p.amount) || 0, date: p.payment_date, n: (cur?.n ?? 0) + 1 });
        }
      }
      setLastPay(lp);
    } catch { /* silent */ }
    finally { if (!silent) setLoading(false); }
  }, [own, myId]);
  useEffect(() => { load(); }, [load]);

  const today = todayKz();
  const weekEnd = new Date(new Date(today + 'T00:00:00').getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const debtors = useMemo(() => deals
    .map(d => ({ d, rest: Math.max(0, Number(d.total_amount) - Number(d.paid_amount)) }))
    .filter(x => x.rest > 0), [deals]);

  const totals = useMemo(() => {
    let all = 0, overdue = 0, week = 0, waiting = 0;
    for (const { d, rest } of debtors) {
      all += rest;
      const due = effectiveDueDate(d);
      if (!due) waiting += rest;
      else if (due < today) overdue += rest;
      else if (due <= weekEnd) week += rest;
    }
    return { all, overdue, week, waiting };
  }, [debtors, today, weekEnd]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qKeys = phoneKeys(search);
    return debtors
      .filter(({ d }) => managerId === 'all' || d.manager_id === managerId)
      .filter(({ d }) => {
        const due = effectiveDueDate(d);
        if (filter === 'overdue') return !!due && due < today;
        if (filter === 'week') return !!due && due >= today && due <= weekEnd;
        if (filter === 'waiting') return !due;
        return true;
      })
      .filter(({ d }) => !q || (d.client_name ?? '').toLowerCase().includes(q) || (d.client_phone ?? '').includes(q) || (d.contract_number ?? '').toLowerCase().includes(q)
        || (qKeys.length > 0 && phoneKeys(d.client_phone).some(k => qKeys.includes(k))))
      .sort((a, b) => {
        // Сначала просроченные (самые давние), потом по ближайшей дате, ждущие склада — в конце
        const ad = effectiveDueDate(a.d) ?? '9999-12-31';
        const bd = effectiveDueDate(b.d) ?? '9999-12-31';
        return ad === bd ? b.rest - a.rest : ad.localeCompare(bd);
      });
  }, [debtors, filter, managerId, search, today, weekEnd]);

  // Разбивка по срочности — компактными списками
  const groups = useMemo(() => {
    const defs = [
      { key: 'over', label: 'Просрочено', tone: 'text-destructive', test: (due: string | null) => !!due && due < today },
      { key: 'today', label: 'Сегодня', tone: 'text-amber-700', test: (due: string | null) => due === today },
      { key: 'week', label: 'На этой неделе', tone: 'text-foreground', test: (due: string | null) => !!due && due > today && due <= weekEnd },
      { key: 'later', label: 'Позже', tone: 'text-foreground', test: (due: string | null) => !!due && due > weekEnd },
      { key: 'wait', label: 'Ждут склада — доплата после прихода', tone: 'text-muted-foreground', test: (due: string | null) => !due },
    ];
    return defs.map(g => ({ ...g, rows: visible.filter(x => g.test(effectiveDueDate(x.d))) })).filter(g => g.rows.length);
  }, [visible, today, weekEnd]);

  const managerName = (id: string | null) => managers.find(m => m.id === id)?.name ?? '';
  const managersWithDebt = managers.filter(m => debtors.some(x => x.d.manager_id === m.id));

  const tiles: { key: Filter; label: string; value: number; icon: React.ElementType; tone: string }[] = [
    { key: 'all', label: 'Весь долг клиентов', value: totals.all, icon: Wallet, tone: 'text-foreground' },
    { key: 'overdue', label: 'Просрочено', value: totals.overdue, icon: AlertTriangle, tone: 'text-destructive' },
    { key: 'week', label: 'Ожидается за 7 дней', value: totals.week, icon: CalendarClock, tone: 'text-amber-700' },
    { key: 'waiting', label: 'В производстве — ждут склада', value: totals.waiting, icon: Factory, tone: 'text-muted-foreground' },
  ];

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Должники</h1>
          <p className="hidden sm:block text-sm text-muted-foreground mt-0.5">Клиенты с остатком. Остаток доплачивается, когда заказ приходит на «{PAYMENT_TRIGGER_STAGE}» — тогда дата ставится сама. Просроченные — сверху.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {tiles.map(t => (
            <button key={t.key} type="button" onClick={() => setFilter(t.key)}
              className={`text-left rounded-xl border p-2.5 sm:p-3.5 transition-colors bg-card ${filter === t.key ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/40'}`}>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground leading-tight"><t.icon size={13} className="shrink-0" />{t.label}</div>
              <div className={`mt-0.5 sm:mt-1 text-base sm:text-lg font-semibold tabular-nums ${t.tone}`}>{formatCurrency(t.value)}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Имя, телефон или № договора" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {managersWithDebt.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={managerId === 'all' ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setManagerId('all')}>Все</Button>
              {managersWithDebt.map(m => (
                <Button key={m.id} size="sm" variant={managerId === m.id ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setManagerId(m.id)}>{m.name}</Button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            {debtors.length === 0 ? 'Все клиенты рассчитались полностью 🎉' : 'По этому фильтру никого нет'}
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {groups.map(g => (
              <div key={g.key}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5 px-1">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${g.tone}`}>{g.label} <span className="font-normal text-muted-foreground normal-case">· {g.rows.length}</span></p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(g.rows.reduce((a, x) => a + x.rest, 0))}</p>
                </div>
                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {g.rows.map(({ d, rest }) => {
                    const due = effectiveDueDate(d);
                    const overdueDays = due && due < today ? daysBetween(due, today) : 0;
                    const wa = waLink(d.client_phone);
                    const total = Number(d.total_amount) || 0;
                    const pct = total > 0 ? Math.min(100, Math.round(((total - rest) / total) * 100)) : 0;
                    const lp = lastPay.get(d.id);
                    const stageDays = d.production_stage_at ? daysBetween(d.production_stage_at.slice(0, 10), today) : null;
                    const when = waitingForWarehouse(d) ? 'ждёт склада'
                      : !due ? 'после склада'
                      : overdueDays > 0 ? `просрочено ${overdueDays} дн. · с ${formatDate(due)}`
                      : due === today ? 'сегодня' : formatDate(due);
                    return (
                      <div key={d.id} className={`flex items-center gap-2 sm:gap-3 px-3 py-2 ${overdueDays > 0 ? 'bg-destructive/[0.03]' : ''}`}>
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditDeal(d)} title="Открыть сделку">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <DealCompleteness deal={d} />
                            <span className="font-medium text-sm truncate">{d.client_name || 'Без имени'}</span>
                          </span>
                          <span className="block text-[11px] text-muted-foreground truncate">
                            {[managerName(d.manager_id), d.contract_number ? `№${d.contract_number}` : d.has_contract === false ? 'без договора' : null].filter(Boolean).join(' · ')}
                            <span className="hidden sm:inline">{' · '}<span className={overdueDays > 0 ? 'text-destructive font-medium' : due === today ? 'text-amber-700 font-medium' : ''}>{when}</span>{d.production_stage && <span className="lg:hidden"> · {d.production_stage}</span>}</span>
                          </span>
                          <span className={`sm:hidden block text-[11px] truncate ${overdueDays > 0 ? 'text-destructive font-medium' : due === today ? 'text-amber-700 font-medium' : 'text-muted-foreground'}`}>{when}{d.production_stage ? ` · ${d.production_stage}` : ''}</span>
                        </button>
                        {/* Середина строки: что заказали, где производство, когда платили */}
                        <div className="hidden lg:grid grid-cols-3 gap-4 flex-[1.6] min-w-0 text-[11px] leading-tight">
                          <div className="min-w-0">
                            <p className="text-muted-foreground">Заказ</p>
                            <p className="truncate text-foreground" title={d.door_model ?? undefined}>{d.door_model || '—'}</p>
                            {d.address && <p className="truncate text-muted-foreground" title={d.address}>{d.address}</p>}
                          </div>
                          <div className="min-w-0">
                            <p className="text-muted-foreground">Производство</p>
                            {d.production_stage
                              ? <p className="truncate text-foreground" title={d.production_stage}>{d.production_stage}</p>
                              : <p className="text-muted-foreground">нет карточки</p>}
                            {stageDays != null && d.production_stage && <p className={stageDays > 14 ? 'text-amber-700' : 'text-muted-foreground'}>{stageDays === 0 ? 'сегодня' : `${stageDays} дн. на этапе`}</p>}
                          </div>
                          <div className="min-w-0">
                            <p className="text-muted-foreground">Последняя оплата</p>
                            {lp ? <p className="truncate text-foreground">{formatDate(lp.date)} · {formatCurrency(lp.amount)}</p> : <p className="text-muted-foreground">—</p>}
                            <p className="truncate text-muted-foreground">{lp && lp.n > 1 ? `${lp.n} оплат · ` : ''}сделка от {formatDate(d.deal_date)}</p>
                          </div>
                        </div>
                        <div className="hidden md:block w-28 shrink-0" title={`Оплачено ${pct}%`}>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 text-center">оплачено {pct}%</p>
                        </div>
                        <div className="text-right shrink-0 sm:w-28">
                          <p className={`font-semibold text-sm tabular-nums ${overdueDays > 0 ? 'text-destructive' : ''}`}>{formatCurrency(rest)}</p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">из {formatCurrency(total)}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {d.client_phone && <a href={`tel:${d.client_phone.replace(/[^\d+]/g, '')}`} title={`Позвонить ${d.client_phone}`} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-primary hover:bg-primary/10"><Phone size={15} /></a>}
                          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="h-8 w-8 hidden sm:inline-flex items-center justify-center rounded-md text-green-700 hover:bg-green-50"><MessageCircle size={15} /></a>}
                          <ClientHistoryButton phone={d.client_phone} name={d.client_name} label="Все сделки" className="h-8 px-2 hidden sm:inline-flex" />
                          <ClientHistoryButton phone={d.client_phone} name={d.client_name} className="h-8 w-8 justify-center sm:hidden" />
                          <DealPayments deal={d} onChanged={() => load(true)} compact />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editDeal && (
        <DealFormDialog
          open={!!editDeal}
          deal={editDeal}
          managerId={editDeal.manager_id}
          monthYear={editDeal.month_year}
          onClose={() => setEditDeal(null)}
          onSaved={() => { setEditDeal(null); load(true); }}
        />
      )}
    </AppLayout>
  );
}
