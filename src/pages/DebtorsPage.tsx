import React, { useEffect, useMemo, useState, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, MessageCircle, Search, AlertTriangle, CalendarClock, Wallet, Factory } from 'lucide-react';
import { getAllDeals, getManagers } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, Manager } from '@/types/types';
import DealPayments from '@/components/sales/DealPayments';
import DealFormDialog from '@/components/sales/DealFormDialog';
import DealCompleteness from '@/components/sales/DealCompleteness';
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
  const [search, setSearch] = useState('');
  const [editDeal, setEditDeal] = useState<Deal | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [d, m] = await Promise.all([getAllDeals(), getManagers()]);
      setDeals(d);
      setManagers(m);
    } catch { /* silent */ }
    finally { if (!silent) setLoading(false); }
  }, []);
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
    return debtors
      .filter(({ d }) => managerId === 'all' || d.manager_id === managerId)
      .filter(({ d }) => {
        const due = effectiveDueDate(d);
        if (filter === 'overdue') return !!due && due < today;
        if (filter === 'week') return !!due && due >= today && due <= weekEnd;
        if (filter === 'waiting') return !due;
        return true;
      })
      .filter(({ d }) => !q || (d.client_name ?? '').toLowerCase().includes(q) || (d.client_phone ?? '').includes(q) || (d.contract_number ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Сначала просроченные (самые давние), потом по ближайшей дате, ждущие склада — в конце
        const ad = effectiveDueDate(a.d) ?? '9999-12-31';
        const bd = effectiveDueDate(b.d) ?? '9999-12-31';
        return ad === bd ? b.rest - a.rest : ad.localeCompare(bd);
      });
  }, [debtors, filter, managerId, search, today, weekEnd]);

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
          <p className="text-sm text-muted-foreground mt-0.5">Клиенты с остатком. Остаток доплачивается, когда заказ приходит на «{PAYMENT_TRIGGER_STAGE}» — тогда дата ставится сама. Просроченные — сверху.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map(t => (
            <button key={t.key} type="button" onClick={() => setFilter(t.key)}
              className={`text-left rounded-xl border p-3.5 transition-colors bg-card ${filter === t.key ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/40'}`}>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><t.icon size={13} />{t.label}</div>
              <div className={`mt-1 text-lg font-semibold tabular-nums ${t.tone}`}>{formatCurrency(t.value)}</div>
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(({ d, rest }) => {
              const due = effectiveDueDate(d);
              const overdueDays = due && due < today ? daysBetween(due, today) : 0;
              const isToday = due === today;
              const wa = waLink(d.client_phone);
              return (
                <Card key={d.id} className={overdueDays > 0 ? 'border-destructive/40' : ''}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" className="min-w-0 text-left" onClick={() => setEditDeal(d)} title="Открыть сделку">
                        <div className="flex items-center gap-1.5">
                          <DealCompleteness deal={d} />
                          <span className="font-medium truncate hover:underline">{d.client_name || 'Без имени'}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {managerName(d.manager_id)}{d.contract_number ? ` · Договор №${d.contract_number}` : ''}
                        </div>
                      </button>
                      <div className="text-right shrink-0">
                        <div className="font-semibold tabular-nums">{formatCurrency(rest)}</div>
                        <div className="text-[11px] text-muted-foreground">из {formatCurrency(d.total_amount)}</div>
                      </div>
                    </div>

                    <div className="text-xs">
                      {waitingForWarehouse(d) ? (
                        <span className="text-muted-foreground inline-flex items-center gap-1"><Factory size={12} />В производстве ({d.production_stage}) — доплата после «{PAYMENT_TRIGGER_STAGE}»</span>
                      ) : !due ? (
                        <span className="text-muted-foreground">Доплата — когда заказ придёт на «{PAYMENT_TRIGGER_STAGE}»</span>
                      ) : overdueDays > 0 ? (
                        <span className="text-destructive font-medium">Просрочено на {overdueDays} дн. (с {formatDate(due)}){d.production_stage ? ` · ${d.production_stage}` : ''}</span>
                      ) : isToday ? (
                        <span className="text-amber-700 font-medium">Пора доплатить — сегодня{d.production_stage ? ` · ${d.production_stage}` : ''}</span>
                      ) : (
                        <span className="text-muted-foreground">Следующая доплата {formatDate(due)}</span>
                      )}
                    </div>

                    {d.client_phone && (
                      <div className="flex gap-2">
                        <a href={`tel:${d.client_phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Phone size={12} />{d.client_phone}</a>
                        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline"><MessageCircle size={12} />WhatsApp</a>}
                      </div>
                    )}

                    <DealPayments deal={d} onChanged={() => load(true)} />
                  </CardContent>
                </Card>
              );
            })}
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
