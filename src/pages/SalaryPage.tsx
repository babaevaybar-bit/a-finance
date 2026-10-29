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
import { Pencil, Check, X } from 'lucide-react';
import {
  getManagers, getSalarySettings, upsertSalarySetting, getExpenses, createExpense,
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
import type { Manager, SalarySetting, Deal } from '@/types/types';
import { SALES_ROLES, ADVANCE_CATEGORY, PAYOUT_CATEGORY, CHANNELS } from '@/types/types';

// ─── row with inline edit ──────────────────────────────────────────────────────
interface RowProps {
  manager: Manager;
  setting: SalarySetting | undefined;
  revenue: number;         // личные сделки менеджера
  companyRevenue: number;  // общая выручка компании
  onSaved: () => void;
}

function ManagerSalaryRow({ manager, setting, revenue, companyRevenue, onSaved, advance = 0, paid = 0, onPay, onAdvance }: RowProps & { advance?: number; paid?: number; onPay?: (amount: number) => void; onAdvance?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [base, setBase]       = useState(String(setting?.base_salary ?? 0));
  const [pct, setPct]         = useState(String(setting?.commission_pct ?? 0));
  // usePersonal: true = личные сделки, false = общая выручка
  const [usePersonal, setUsePersonal] = useState<boolean>(
    setting?.use_personal_revenue ?? SALES_ROLES.includes(manager.role)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBase(String(setting?.base_salary ?? 0));
    setPct(String(setting?.commission_pct ?? 0));
    setUsePersonal(setting?.use_personal_revenue ?? SALES_ROLES.includes(manager.role));
  }, [setting, manager.role]);

  const baseSalary = Number(base) || 0;
  const commPct    = Number(pct)  || 0;
  const revenueBase = usePersonal ? revenue : companyRevenue;
  const commission  = revenueBase * (commPct / 100);
  const total       = baseSalary + commission;
  const rest        = total - advance - paid;

  async function save() {
    if (baseSalary < 0 || commPct < 0) { toast.error('Значения не могут быть отрицательными'); return; }
    setSaving(true);
    try {
      await upsertSalarySetting({
        manager_id: manager.id,
        base_salary: baseSalary,
        commission_pct: commPct,
        use_personal_revenue: usePersonal,
      });
      toast.success('Настройки сохранены');
      onSaved();
      setEditing(false);
    } catch { toast.error('Ошибка сохранения'); } finally { setSaving(false); }
  }

  function cancel() {
    setBase(String(setting?.base_salary ?? 0));
    setPct(String(setting?.commission_pct ?? 0));
    setUsePersonal(setting?.use_personal_revenue ?? SALES_ROLES.includes(manager.role));
    setEditing(false);
  }

  return (
    <tr className="border-b border-border last:border-0">
      {/* Сотрудник */}
      <td className="whitespace-nowrap py-3 pr-4 text-sm font-medium">
        <div>{manager.name}</div>
        <div className="mt-0.5">
          <Badge variant="secondary" className="text-xs">{manager.role || '—'}</Badge>
        </div>
      </td>
      {/* База выручки */}
      <td className="whitespace-nowrap py-3 px-3 text-sm">
        {editing ? (
          <Select value={usePersonal ? 'personal' : 'company'} onValueChange={v => setUsePersonal(v === 'personal')}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Личные сделки</SelectItem>
              <SelectItem value="company">Общая выручка</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={usePersonal ? 'default' : 'outline'} className="text-xs">
            {usePersonal ? 'Личные сделки' : 'Общая выручка'}
          </Badge>
        )}
      </td>
      {/* Сумма базы */}
      <td className="whitespace-nowrap py-3 px-3 text-right text-sm tabular-nums text-muted-foreground">
        {formatCurrency(revenueBase)}
      </td>
      {/* Оклад */}
      <td className="whitespace-nowrap py-3 px-3 text-right text-sm tabular-nums">
        {editing
          ? <Input type="number" min="0" step="1000" className="h-7 w-28 text-right text-sm px-2" value={base} onChange={e => setBase(e.target.value)} />
          : formatCurrency(baseSalary)}
      </td>
      {/* % */}
      <td className="whitespace-nowrap py-3 px-3 text-right text-sm tabular-nums">
        {editing
          ? <Input type="number" min="0" max="100" step="0.5" className="h-7 w-20 text-right text-sm px-2" value={pct} onChange={e => setPct(e.target.value)} />
          : `${commPct}%`}
      </td>
      {/* Комиссия */}
      <td className="whitespace-nowrap py-3 px-3 text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(commission)}</td>
      {/* Итого */}
      <td className="whitespace-nowrap py-3 pl-3 text-right text-sm tabular-nums font-semibold">{formatCurrency(total)}</td>
      {/* Аванс: выданный за месяц вычитается из зарплаты */}
      <td className="whitespace-nowrap py-3 px-3 text-right text-sm tabular-nums">
        <div className={advance > 0 ? 'text-amber-700' : 'text-muted-foreground'}>{advance > 0 ? `− ${formatCurrency(advance)}` : '—'}</div>
        {onAdvance && <button type="button" className="text-[11px] text-primary underline" onClick={onAdvance}>+ аванс</button>}
      </td>
      {/* Выплачено зарплатой */}
      <td className="whitespace-nowrap py-3 px-3 text-right text-sm tabular-nums text-muted-foreground">{paid > 0 ? `− ${formatCurrency(paid)}` : '—'}</td>
      <td className="whitespace-nowrap py-3 pl-3 text-right text-sm tabular-nums">
        <div className={`font-semibold ${rest > 0 ? 'text-primary' : 'text-green-700'}`}>
          {rest > 0 ? formatCurrency(rest) : 'Выплачено'}
        </div>
        {rest > 0 && onPay && (
          <button type="button" className="text-[11px] text-primary underline" onClick={() => onPay(rest)}>Выплатить</button>
        )}
      </td>
      {/* Действия */}
      <td className="whitespace-nowrap py-3 pl-3">
        {editing ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={save} disabled={saving}><Check size={13} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancel}><X size={13} /></Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}><Pencil size={13} /></Button>
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
/** Менеджер видит только свою зарплату, остальные — расчёт по всем сотрудникам */
export default function SalaryPage() {
  const { isManager, isLidorub } = useAuth();
  return isManager || isLidorub ? <MySalary /> : <SalaryAdmin />;
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

function SalaryAdmin() {
  const [managers, setManagers]   = useState<Manager[]>([]);
  const [settings, setSettings]   = useState<SalarySetting[]>([]);
  const [deals, setDeals]         = useState<Deal[]>([]);
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const [loading, setLoading]     = useState(true);



  const [advances, setAdvances] = useState<Record<string, number>>({});
  const [payouts, setPayouts] = useState<Record<string, number>>({});
  // kind: 'advance' — аванс (вычитается из зарплаты месяца), 'payout' — выплата зарплаты
  const [payTarget, setPayTarget] = useState<{ id: string; name: string; amount: number; kind: 'advance' | 'payout' } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payChannel, setPayChannel] = useState<string>('Наличные');
  const [paying, setPaying] = useState(false);

  async function handlePay() {
    if (!payTarget || payAmount <= 0) return;
    setPaying(true);
    try {
      await createExpense({
        expense_date: new Date().toISOString().slice(0, 10),
        amount: payAmount,
        channel: payChannel,
        category: payTarget.kind === 'advance' ? ADVANCE_CATEGORY : PAYOUT_CATEGORY,
        description: `${payTarget.kind === 'advance' ? 'Аванс' : 'Зарплата'} за ${monthYearToLabel(monthYear)}: ${payTarget.name}`,
        month_year: monthYear, // относится к месяцу начисления, даже если платим в следующем
        deal_id: null,
        manager_id: payTarget.id,
      });
      toast.success(`${payTarget.kind === 'advance' ? 'Аванс выдан' : 'Выплачено'}: ${formatCurrency(payAmount)} — ${payTarget.name} (${payChannel})`);
      setPayTarget(null);
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setPaying(false); }
  }
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, setts, dls, exps] = await Promise.all([
        getManagers(),
        getSalarySettings(),
        getAllDealsForMonth(monthYear),
        getExpenses(),
      ]);
      setManagers(mgrs); setSettings(setts); setDeals(dls);
      // Авансы этого месяца по сотрудникам (вносятся в «Финансах» как расход «Аванс сотруднику»)
      const adv: Record<string, number> = {}, out: Record<string, number> = {};
      exps.filter(e => e.manager_id && (e.month_year ?? e.expense_date.slice(0, 7)) === monthYear).forEach(e => {
        if (e.category === ADVANCE_CATEGORY) adv[e.manager_id!] = (adv[e.manager_id!] ?? 0) + Number(e.amount);
        else if (e.category === PAYOUT_CATEGORY) out[e.manager_id!] = (out[e.manager_id!] ?? 0) + Number(e.amount);
      });
      setAdvances(adv); setPayouts(out);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [monthYear]);

  useEffect(() => { load(); }, [load]);

  // Company-wide revenue (approved deals only — salary_amount ?? total_amount)
  const companyRevenue = deals
    .filter(d => d.status === 'approved')
    .reduce((s, d) => s + Number(d.salary_amount ?? d.total_amount), 0);

  // Revenue per manager (own approved deals)
  function managerPersonalRevenue(m: Manager): number {
    return deals
      .filter(d => d.manager_id === m.id && d.status === 'approved')
      .reduce((s, d) => s + Number(d.salary_amount ?? d.total_amount), 0);
  }

  // Total salary fund
  const totalSalary = managers.reduce((s, m) => {
    const sett  = settings.find(ss => ss.manager_id === m.id);
    const usePersonal = sett?.use_personal_revenue ?? SALES_ROLES.includes(m.role);
    const rev   = usePersonal ? managerPersonalRevenue(m) : companyRevenue;
    const base  = Number(sett?.base_salary ?? 0);
    const pct   = Number(sett?.commission_pct ?? 0);
    return s + base + rev * (pct / 100);
  }, 0);

  const advTotal = Object.values(advances).reduce((x, y) => x + y, 0);
  const paidTotal = Object.values(payouts).reduce((x, y) => x + y, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Зарплаты</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Менеджеры по продажам — от своих сделок. Остальные — от общей выручки компании.
            </p>
          </div>
          <MonthYearPicker value={monthYear} onChange={setMonthYear} className="shrink-0" />
        </div>

        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Общий ФОТ ({monthYearToLabel(monthYear)})</p>
              <p className="text-base font-semibold mt-1">{formatCurrency(totalSalary)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Сотрудников</p>
              <p className="text-base font-semibold mt-1">{managers.length}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Выручка компании (подтверждённые)</p>
              <p className="text-base font-semibold mt-1">{formatCurrency(companyRevenue)}</p>
            </div>
          </div>
        )}

        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Расчёт зарплат — {monthYearToLabel(monthYear)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Нажмите <Pencil size={10} className="inline mb-0.5" /> чтобы изменить оклад или процент
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
              </div>
            ) : managers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Нет сотрудников</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left whitespace-nowrap py-2 pr-4 font-medium text-muted-foreground">Сотрудник</th>
                      <th className="text-left whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">База ЗП</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">Сумма базы (₸)</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">Оклад (₸)</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">% комиссии</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">Комиссия (₸)</th>
                      <th className="text-right whitespace-nowrap py-2 pl-3 font-medium text-muted-foreground">Итого ЗП</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">Аванс</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">Выплачено</th>
                      <th className="text-right whitespace-nowrap py-2 pl-3 font-medium text-muted-foreground">К выплате</th>
                      <th className="whitespace-nowrap py-2 pl-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map(m => (
                       <ManagerSalaryRow
                         key={m.id}
                         manager={m}
                         setting={settings.find(s => s.manager_id === m.id)}
                         revenue={managerPersonalRevenue(m)}
                         companyRevenue={companyRevenue}
                         onSaved={load}
                         advance={advances[m.id] ?? 0}
                         paid={payouts[m.id] ?? 0}
                         onPay={amount => { setPayTarget({ id: m.id, name: m.name, amount, kind: 'payout' }); setPayAmount(amount); }}
                         onAdvance={() => { setPayTarget({ id: m.id, name: m.name, amount: 0, kind: 'advance' }); setPayAmount(0); }}
                       />
                    ))}
                    <tr className="border-t border-border bg-muted/30">
                      <td className="py-2.5 pr-4 text-sm font-semibold" colSpan={6}>ИТОГО ФОТ</td>
                      <td className="py-2.5 pl-3 text-right text-sm font-semibold tabular-nums">{formatCurrency(totalSalary)}</td>
                      <td className="py-2.5 px-3 text-right text-sm tabular-nums text-amber-700">{advTotal > 0 ? `− ${formatCurrency(advTotal)}` : '—'}</td>
                      <td className="py-2.5 px-3 text-right text-sm tabular-nums text-muted-foreground">{paidTotal > 0 ? `− ${formatCurrency(paidTotal)}` : '—'}</td>
                      <td className="py-2.5 pl-3 text-right text-sm font-semibold tabular-nums text-primary">{formatCurrency(totalSalary - advTotal - paidTotal)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Итого ЗП = Оклад + База × % комиссии.</span>{' '}
          Менеджеры по продажам: база = личные подтверждённые сделки.
          Остальные: база = общая подтверждённая выручка компании за месяц.
        </p>
      </div>
      <Dialog open={!!payTarget} onOpenChange={v => !v && setPayTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{payTarget?.kind === 'advance' ? 'Аванс' : 'Выплата зарплаты'} — {payTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {payTarget?.kind === 'advance'
                ? <>Аванс за {monthYearToLabel(monthYear)} — сумма вычтется из зарплаты этого месяца. Запишется расходом «Аванс сотруднику».</>
                : <>За {monthYearToLabel(monthYear)}. Осталось выплатить {payTarget ? formatCurrency(payTarget.amount) : ''}. Запишется расходом «Выплата зарплаты» — в прибыли второй раз не посчитается.</>}
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Сумма</Label>
              <Input type="number" value={payAmount || ''} onChange={e => setPayAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Из какой кассы</Label>
              <Select value={payChannel} onValueChange={setPayChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Отмена</Button>
            <Button onClick={handlePay} disabled={paying || payAmount <= 0}>{paying ? 'Сохранение...' : payTarget?.kind === 'advance' ? 'Выдать аванс' : 'Выплатить'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

