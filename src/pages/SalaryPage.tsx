import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Pencil, Banknote, HandCoins, ChevronDown, Trash2 } from 'lucide-react';
import {
  getManagers, getSalarySettings, upsertSalarySetting, getExpenses, createExpense, deleteExpense,
  getAllDealsForMonth,
} from '@/lib/api';
import {
  formatCurrency, getCurrentMonthYear, getAvailableMonths, monthYearToLabel,
} from '@/lib/utils';
import MonthYearPicker from '@/components/common/MonthYearPicker';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Manager, SalarySetting, Deal, Expense } from '@/types/types';
import { SALES_ROLES, ADVANCE_CATEGORY, PAYOUT_CATEGORY, CHANNELS } from '@/types/types';

// ─── Page ─────────────────────────────────────────────────────────────────────
/** Менеджер видит только свою зарплату, остальные — расчёт по всем сотрудникам */
export default function SalaryPage() {
  const { isManager, isLidorub, isRop, seesAll } = useAuth();
  // РОП/Технолог с «Только свои» в зарплатах — видят только свою
  return isManager || isLidorub || (isRop && !seesAll('salary')) ? <MySalary /> : <SalaryAdmin />;
}

interface MySalaryRow { manager_name: string; base_salary: number; commission_pct: number; use_personal: boolean; revenue_base: number; deals_count: number; commission: number; total: number; paid: number }

interface AllSalaryRow extends MySalaryRow { manager_id: string; role: string | null }

function MySalary() {
  const { seesAll } = useAuth();
  const showAll = seesAll('salary');
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const [row, setRow] = useState<MySalaryRow | null | undefined>(undefined);
  const [all, setAll] = useState<AllSalaryRow[] | null>(null);
  useEffect(() => {
    setRow(undefined);
    supabase.rpc('my_salary', { p_month: monthYear }).then(({ data, error }) => {
      if (error) { toast.error('Не удалось загрузить зарплату'); setRow(null); return; }
      setRow(((data as MySalaryRow[] | null) ?? [])[0] ?? null);
    });
  }, [monthYear]);
  useEffect(() => {
    if (!showAll) { setAll(null); return; }
    setAll(null);
    supabase.rpc('all_salaries', { p_month: monthYear }).then(({ data, error }) => {
      if (error) { toast.error('Не удалось загрузить зарплаты сотрудников'); setAll([]); return; }
      setAll((data as AllSalaryRow[] | null) ?? []);
    });
  }, [monthYear, showAll]);
  const left = row ? Number(row.total) - Number(row.paid) : 0;
  const item = (label: string, value: string, sub?: string, strong = false) => (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? 'text-2xl font-semibold text-primary' : 'text-lg font-semibold'}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
  return (
    <AppLayout>
      <div className={`space-y-6 ${showAll ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Моя зарплата</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{monthYearToLabel(monthYear)}</p>
          </div>
          <MonthYearPicker value={monthYear} onChange={setMonthYear} className="shrink-0" />
        </div>
        {row === undefined ? (
          <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : row === null ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Ваш профиль не привязан к сотруднику — обратитесь к руководителю</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {item('Начислено', formatCurrency(Number(row.total)), 'оклад + комиссия', true)}
              {item('Выплачено', formatCurrency(Number(row.paid)), 'авансы и выплаты')}
              {item(left > 0 ? 'К выплате' : 'Остаток', left > 0 ? formatCurrency(left) : 'Выплачено полностью')}
            </div>
            <Card>
              <CardContent className="p-0 divide-y text-sm">
                {[
                  ['Оклад', formatCurrency(Number(row.base_salary))],
                  [row.use_personal ? 'Мои подтверждённые сделки' : 'Выручка компании (подтверждённые)', `${formatCurrency(Number(row.revenue_base))}${row.use_personal ? ` · ${row.deals_count} сд.` : ''}`],
                  ['Процент', `${Number(row.commission_pct)}%`],
                  ['Комиссия', formatCurrency(Number(row.commission))],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-muted-foreground">{k}</span><span className="font-medium tabular-nums text-right">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">Комиссия считается только с подтверждённых сделок. Если сделки нет в расчёте — проверьте её статус в «Подтверждениях».</p>
          </>
        )}
        {showAll && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Зарплаты сотрудников — {monthYearToLabel(monthYear)}</CardTitle>
              <p className="text-xs text-muted-foreground">Только просмотр. Оклад, процент и выплаты меняет руководитель.</p>
            </CardHeader>
            <CardContent>
              {all === null ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
              ) : all.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Нет данных</p>
              ) : (
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left font-medium py-2 pr-3 whitespace-nowrap">Сотрудник</th>
                        <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Оклад</th>
                        <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Комиссия</th>
                        <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Итого</th>
                        <th className="text-right font-medium py-2 px-3 whitespace-nowrap">Выплачено</th>
                        <th className="text-right font-medium py-2 pl-3 whitespace-nowrap">К выплате</th>
                      </tr>
                    </thead>
                    <tbody>
                      {all.map(r => {
                        const rest = Number(r.total) - Number(r.paid);
                        return (
                          <tr key={r.manager_id} className="border-b border-border last:border-0">
                            <td className="py-2.5 pr-3">
                              <div className="font-medium">{r.manager_name}</div>
                              <div className="text-[11px] text-muted-foreground">{r.role ?? ''}{Number(r.commission_pct) > 0 ? ` · ${Number(r.commission_pct)}% от ${r.use_personal ? 'своих сделок' : 'выручки'}` : ''}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(Number(r.base_salary))}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(Number(r.commission))}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{formatCurrency(Number(r.total))}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{Number(r.paid) > 0 ? formatCurrency(Number(r.paid)) : '—'}</td>
                            <td className="py-2.5 pl-3 text-right tabular-nums">{rest > 0 ? formatCurrency(rest) : '—'}</td>
                          </tr>
                        );
                      })}
                      <tr className="bg-muted/30">
                        <td className="py-2.5 pr-3 font-semibold">ИТОГО</td>
                        <td colSpan={2}></td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{formatCurrency(all.reduce((s, r) => s + Number(r.total), 0))}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{formatCurrency(all.reduce((s, r) => s + Number(r.paid), 0))}</td>
                        <td className="py-2.5 pl-3 text-right tabular-nums font-semibold">{formatCurrency(all.reduce((s, r) => s + Math.max(0, Number(r.total) - Number(r.paid)), 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Руководитель: расчёт и выплата зарплат ────────────────────────────────────
type PayKind = 'advance' | 'payout';
interface Calc {
  m: Manager; setting?: SalarySetting; personal: boolean; base: number; pct: number;
  revenue: number; ownRevenue: number; deals: number; commission: number; total: number; advance: number; paid: number; rest: number; ops: Expense[];
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

function SalaryAdmin() {
  const { isDirector } = useAuth();
  const [managers, setManagers]   = useState<Manager[]>([]);
  const [settings, setSettings]   = useState<SalarySetting[]>([]);
  const [deals, setDeals]         = useState<Deal[]>([]);
  const [ops, setOps]             = useState<Expense[]>([]);
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<'all' | 'due' | 'done'>('all');
  const [openId, setOpenId]       = useState<string | null>(null);

  const [payTarget, setPayTarget] = useState<{ id: string; name: string; rest: number; kind: PayKind } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payChannel, setPayChannel] = useState<string>('Наличные');
  const [paying, setPaying] = useState(false);
  const [editTarget, setEditTarget] = useState<Calc | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, setts, dls, exps] = await Promise.all([getManagers(), getSalarySettings(), getAllDealsForMonth(monthYear), getExpenses()]);
      setManagers(mgrs); setSettings(setts); setDeals(dls);
      setOps(exps.filter(e => e.manager_id && (e.category === ADVANCE_CATEGORY || e.category === PAYOUT_CATEGORY)
        && (e.month_year ?? e.expense_date.slice(0, 7)) === monthYear));
    } catch { toast.error('Не удалось загрузить зарплаты'); } finally { setLoading(false); }
  }, [monthYear]);
  useEffect(() => { load(); }, [load]);

  const approved = deals.filter(d => d.status === 'approved');
  const companyRevenue = approved.reduce((s, d) => s + Number(d.salary_amount ?? d.total_amount), 0);

  const rows: Calc[] = managers.map(m => {
    const setting = settings.find(s => s.manager_id === m.id);
    const personal = setting?.use_personal_revenue ?? SALES_ROLES.includes(m.role);
    const own = approved.filter(d => d.manager_id === m.id);
    const ownRevenue = own.reduce((s, d) => s + Number(d.salary_amount ?? d.total_amount), 0);
    const revenue = personal ? ownRevenue : companyRevenue;
    const base = Number(setting?.base_salary ?? 0), pct = Number(setting?.commission_pct ?? 0);
    const commission = revenue * pct / 100, total = base + commission;
    const my = ops.filter(o => o.manager_id === m.id).sort((a, b) => b.expense_date.localeCompare(a.expense_date));
    const advance = my.filter(o => o.category === ADVANCE_CATEGORY).reduce((s, o) => s + Number(o.amount), 0);
    const paid = my.filter(o => o.category === PAYOUT_CATEGORY).reduce((s, o) => s + Number(o.amount), 0);
    return { m, setting, personal, base, pct, revenue, ownRevenue, deals: personal ? own.length : approved.length, commission, total, advance, paid, rest: total - advance - paid, ops: my };
  })
    // уволенные — только если им что‑то начислено или выдано в этом месяце
    .filter(r => r.m.is_active !== false || r.total > 0 || r.ops.length > 0);

  const fot = rows.reduce((s, r) => s + r.total, 0);
  const advTotal = rows.reduce((s, r) => s + r.advance, 0);
  const paidTotal = rows.reduce((s, r) => s + r.paid, 0);
  const restTotal = rows.reduce((s, r) => s + Math.max(0, r.rest), 0);
  const isDone = (r: Calc) => r.total > 0 && r.rest <= 0;
  const shown = rows.filter(r => filter === 'all' || (filter === 'done' ? isDone(r) : r.rest > 0));

  function openPay(r: Calc, kind: PayKind) {
    setPayTarget({ id: r.m.id, name: r.m.name, rest: Math.max(0, r.rest), kind });
    setPayAmount(kind === 'payout' && r.rest > 0 ? String(Math.round(r.rest)) : '');
  }

  async function handlePay() {
    const amount = Number(payAmount);
    if (!payTarget || !(amount > 0)) return;
    setPaying(true);
    try {
      await createExpense({
        expense_date: new Date().toISOString().slice(0, 10),
        amount, channel: payChannel,
        category: payTarget.kind === 'advance' ? ADVANCE_CATEGORY : PAYOUT_CATEGORY,
        description: `${payTarget.kind === 'advance' ? 'Аванс' : 'Зарплата'} за ${monthYearToLabel(monthYear)}: ${payTarget.name}`,
        month_year: monthYear, // относится к месяцу начисления, даже если платим в следующем
        deal_id: null, manager_id: payTarget.id,
      });
      toast.success(`${payTarget.kind === 'advance' ? 'Аванс выдан' : 'Выплачено'}: ${formatCurrency(amount)} — ${payTarget.name}`);
      setPayTarget(null);
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setPaying(false); }
  }

  async function removeOp(o: Expense) {
    if (!confirm(`Удалить ${o.category === ADVANCE_CATEGORY ? 'аванс' : 'выплату'} ${formatCurrency(Number(o.amount))} от ${shortDate(o.expense_date)}?`)) return;
    try { await deleteExpense(o.id); toast.success('Удалено'); await load(); }
    catch { toast.error('Не удалось удалить'); }
  }

  const tile = (label: string, value: string, sub?: string, tone = '') => (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Зарплаты</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Начислено, выдано авансом и сколько осталось выплатить — за {monthYearToLabel(monthYear)}</p>
          </div>
          <MonthYearPicker value={monthYear} onChange={setMonthYear} className="shrink-0" />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tile('Начислено (ФОТ)', formatCurrency(fot), `выручка компании ${formatCurrency(companyRevenue)}`)}
            {tile('Выдано авансом', formatCurrency(advTotal), undefined, advTotal > 0 ? 'text-amber-700' : '')}
            {tile('Выплачено', formatCurrency(paidTotal))}
            {tile('Осталось выплатить', formatCurrency(restTotal), undefined, restTotal > 0 ? 'text-primary' : 'text-green-700')}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {([['all', `Все ${rows.length}`], ['due', `К выплате ${rows.filter(r => r.rest > 0).length}`], ['done', `Рассчитаны ${rows.filter(isDone).length}`]] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors ${filter === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : shown.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{rows.length ? 'Никого по этому фильтру' : 'Нет сотрудников'}</CardContent></Card>
        ) : (
          <div className="space-y-2.5">
            {shown.map(r => {
              const out = r.advance + r.paid;
              const pctPaid = r.total > 0 ? Math.min(100, (out / r.total) * 100) : 0;
              const pctAdv = r.total > 0 ? Math.min(100, (r.advance / r.total) * 100) : 0;
              const open = openId === r.m.id;
              return (
                <div key={r.m.id} className="rounded-xl border border-border bg-card">
                  <div className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
                    {/* кто и как считается */}
                    <div className="flex items-start gap-3 min-w-0 md:w-[38%]">
                      <span className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">{initials(r.m.name)}</span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.m.name}{r.m.is_active === false && <span className="ml-1.5 text-[11px] text-muted-foreground">(уволен)</span>}</div>
                        <div className="text-xs text-muted-foreground truncate">{r.m.role || '—'}</div>
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {r.base > 0 || r.pct > 0 ? (<>
                            Оклад {formatCurrency(r.base)}
                            {r.pct > 0 && <> + {r.pct}% от {r.personal ? `своих сделок (${r.deals})` : 'выручки компании'} {formatCurrency(r.revenue)} = <span className="text-foreground">{formatCurrency(r.commission)}</span></>}
                          </>) : <span className="text-amber-700">Оклад и процент не заданы</span>}
                        </div>
                      </div>
                    </div>

                    {/* деньги */}
                    <div className="flex-1 min-w-0">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div><div className="text-[11px] text-muted-foreground">Начислено</div><div className="font-semibold tabular-nums">{formatCurrency(r.total)}</div></div>
                        <div><div className="text-[11px] text-muted-foreground">Аванс / выплачено</div><div className="tabular-nums">
                          <span className={r.advance > 0 ? 'text-amber-700' : 'text-muted-foreground'}>{r.advance > 0 ? formatCurrency(r.advance) : '—'}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className={r.paid > 0 ? '' : 'text-muted-foreground'}>{r.paid > 0 ? formatCurrency(r.paid) : '—'}</span>
                        </div></div>
                        <div><div className="text-[11px] text-muted-foreground">{r.rest < 0 ? 'Переплата' : 'К выплате'}</div>
                          <div className={`font-semibold tabular-nums ${r.rest > 0 ? 'text-primary' : r.rest < 0 ? 'text-destructive' : 'text-green-700'}`}>
                            {r.rest > 0 ? formatCurrency(r.rest) : r.rest < 0 ? formatCurrency(-r.rest) : r.total > 0 ? 'Выплачено ✓' : '—'}
                          </div></div>
                      </div>
                      {r.total > 0 && (
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden flex" title="Аванс и выплаты от начисленного">
                          <div className="h-full bg-amber-500" style={{ width: `${pctAdv}%` }} />
                          <div className="h-full bg-primary" style={{ width: `${Math.max(0, pctPaid - pctAdv)}%` }} />
                        </div>
                      )}
                    </div>

                    {/* действия */}
                    <div className="flex gap-1.5 md:flex-col md:w-32 shrink-0">
                      <Button size="sm" className="flex-1 md:flex-none h-9" disabled={r.rest <= 0} onClick={() => openPay(r, 'payout')}><Banknote size={15} className="mr-1.5" />Выплатить</Button>
                      <Button size="sm" variant="outline" className="flex-1 md:flex-none h-9" onClick={() => openPay(r, 'advance')}><HandCoins size={15} className="mr-1.5" />Аванс</Button>
                    </div>
                  </div>
                  <div className="border-t border-border px-3.5 sm:px-4 py-1.5 flex items-center gap-3 text-xs">
                    <button type="button" onClick={() => setOpenId(open ? null : r.m.id)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground py-1">
                      <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                      История выплат{r.ops.length ? ` (${r.ops.length})` : ''}
                    </button>
                    <span className="flex-1" />
                    <button type="button" onClick={() => setEditTarget(r)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground py-1"><Pencil size={12} />Оклад и процент</button>
                  </div>
                  {open && (
                    <div className="border-t border-border px-3.5 sm:px-4 py-2">
                      {r.ops.length === 0 ? <p className="text-xs text-muted-foreground py-2">В этом месяце авансов и выплат не было</p> : (
                        <div className="divide-y">
                          {r.ops.map(o => (
                            <div key={o.id} className="flex items-center gap-2 py-2 text-sm">
                              <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${o.category === ADVANCE_CATEGORY ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                                {o.category === ADVANCE_CATEGORY ? 'аванс' : 'зарплата'}
                              </span>
                              <span className="text-muted-foreground w-16 shrink-0">{shortDate(o.expense_date)}</span>
                              <span className="text-muted-foreground truncate flex-1">{o.channel}</span>
                              <span className="font-medium tabular-nums">{formatCurrency(Number(o.amount))}</span>
                              {isDirector && (
                                <button type="button" onClick={() => removeOp(o)} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive" aria-label="Удалить"><Trash2 size={13} /></button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Начислено = оклад + процент. Менеджеры по продажам — от своих подтверждённых сделок, остальные — от общей подтверждённой выручки за месяц.
          К выплате = начислено − аванс − выплачено. Авансы и выплаты попадают в «Финансы» расходами.
        </p>
      </div>

      {/* выдать аванс / выплатить */}
      <Dialog open={!!payTarget} onOpenChange={v => !v && setPayTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{payTarget?.kind === 'advance' ? 'Выдать аванс' : 'Выплатить зарплату'} — {payTarget?.name}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); handlePay(); }}>
            <p className="text-xs text-muted-foreground">
              {payTarget?.kind === 'advance'
                ? <>Аванс за {monthYearToLabel(monthYear)} вычтется из зарплаты этого месяца. Сейчас к выплате {formatCurrency(payTarget?.rest ?? 0)}.</>
                : <>За {monthYearToLabel(monthYear)} осталось выплатить {formatCurrency(payTarget?.rest ?? 0)}.</>}
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Сумма, ₸</Label>
              <Input type="number" inputMode="numeric" min="1" autoFocus value={payAmount} onChange={e => setPayAmount(e.target.value)} className="h-11 text-base tabular-nums" placeholder="0" />
              {payTarget && payTarget.rest > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {(payTarget.kind === 'advance' ? [0.3, 0.5] : [0.5, 1]).map(f => (
                    <button key={f} type="button" onClick={() => setPayAmount(String(Math.round(payTarget.rest * f)))}
                      className="h-7 px-2.5 rounded-md border text-xs hover:bg-muted">{f === 1 ? 'Весь остаток' : `${f * 100}%`} · {formatCurrency(Math.round(payTarget.rest * f))}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Из какой кассы</Label>
              <Select value={payChannel} onValueChange={setPayChannel}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayTarget(null)}>Отмена</Button>
              <Button type="submit" disabled={paying || !(Number(payAmount) > 0)}>{paying ? 'Сохранение…' : payTarget?.kind === 'advance' ? 'Выдать аванс' : 'Выплатить'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SalarySettingsDialog target={editTarget} onClose={() => setEditTarget(null)} onSaved={load} companyRevenue={companyRevenue} />
    </AppLayout>
  );
}

/** Оклад, процент и от чего считать процент — в отдельном окне, с живым расчётом */
function SalarySettingsDialog({ target, onClose, onSaved, companyRevenue }: { target: Calc | null; onClose: () => void; onSaved: () => void; companyRevenue: number }) {
  const [base, setBase] = useState('');
  const [pct, setPct] = useState('');
  const [personal, setPersonal] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!target) return;
    setBase(String(target.base)); setPct(String(target.pct)); setPersonal(target.personal);
  }, [target]);
  if (!target) return null;
  const rev = personal ? target.ownRevenue : companyRevenue;
  const total = (Number(base) || 0) + rev * (Number(pct) || 0) / 100;

  async function save() {
    if (!target) return;
    if ((Number(base) || 0) < 0 || (Number(pct) || 0) < 0) { toast.error('Значения не могут быть отрицательными'); return; }
    setSaving(true);
    try {
      await upsertSalarySetting({ manager_id: target.m.id, base_salary: Number(base) || 0, commission_pct: Number(pct) || 0, use_personal_revenue: personal });
      toast.success('Сохранено');
      onSaved(); onClose();
    } catch { toast.error('Ошибка сохранения'); } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Оклад и процент — {target.m.name}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); save(); }}>
          <div className="space-y-1">
            <Label className="text-xs">Оклад в месяц, ₸</Label>
            <Input type="number" min="0" step="1000" value={base} onChange={e => setBase(e.target.value)} className="h-10 tabular-nums" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Процент</Label>
            <Input type="number" min="0" max="100" step="0.5" value={pct} onChange={e => setPct(e.target.value)} className="h-10 tabular-nums" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Процент считается от</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {[{ v: true, t: 'Своих сделок' }, { v: false, t: 'Выручки компании' }].map(o => (
                <button key={String(o.v)} type="button" onClick={() => setPersonal(o.v)}
                  className={`h-10 rounded-md border text-sm ${personal === o.v ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>{o.t}</button>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            За этот месяц начислено будет <b className="text-foreground">{formatCurrency(total)}</b> ({personal ? 'свои сделки' : 'выручка'} {formatCurrency(rev)})
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
