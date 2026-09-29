import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Download, Lock, Unlock } from 'lucide-react';
import { getAllDealsForMonth, getExpenses, getIncome, getManagers, getSalesPlans, getTransfers, isMonthLocked, lockMonth, unlockMonth } from '@/lib/api';
import { formatCurrency, getCurrentMonthYear, monthYearToLabel } from '@/lib/utils';
import MonthYearPicker from '@/components/common/MonthYearPicker';
import { exportMonthlyReport } from '@/lib/exportExcel';
import type { Deal, Expense, Income, Manager, SalesPlan, Transfer } from '@/types/types';
import { PAYMENT_METHODS } from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function ReportsPage() {
  const { isDirector } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Открытие по ссылке с дашборда (?month=YYYY-MM) — сразу нужный месяц
  const [monthYear, setMonthYear] = useState(searchParams.get('month') || getCurrentMonthYear());
  const [locked, setLocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get('month')) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [deals, setDeals] = useState<Deal[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [plans, setPlans] = useState<SalesPlan[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dls, exps, incs, mgrs, plns, trs, lockStatus] = await Promise.all([
        getAllDealsForMonth(monthYear),
        getExpenses(),
        getIncome(),
        getManagers(),
        getSalesPlans(monthYear),
        getTransfers(),
        isMonthLocked(monthYear),
      ]);
      setDeals(dls); setExpenses(exps); setIncome(incs); setManagers(mgrs); setPlans(plns); setTransfers(trs);
      setLocked(lockStatus);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [monthYear]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleToggleLock() {
    setLockBusy(true);
    try {
      if (locked) { await unlockMonth(monthYear); setLocked(false); toast.success('Месяц снова открыт для изменений'); }
      else { await lockMonth(monthYear); setLocked(true); toast.success('Месяц закрыт — изменения запрещены'); }
    } catch { toast.error('Ошибка'); }
    finally { setLockBusy(false); }
  }

  // Payment method breakdown
  const paymentBreakdown = PAYMENT_METHODS.map(method => {
    const sum = deals.filter(d => d.payment_method === method).reduce((s, d) => s + Number(d.paid_amount), 0);
    const count = deals.filter(d => d.payment_method === method).length;
    return { method, sum, count };
  }).filter(r => r.count > 0);

  const totalPaid = deals.reduce((s, d) => s + Number(d.paid_amount), 0);

  // Per-manager summary for the selected month
  const managerSummary = managers.map(m => {
    const mDeals = deals.filter(d => d.manager_id === m.id);
    const revenue = mDeals.reduce((s, d) => s + Number(d.total_amount), 0);
    const paid = mDeals.reduce((s, d) => s + Number(d.paid_amount), 0);
    const remainder = mDeals.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0);
    return { manager: m, count: mDeals.length, revenue, paid, remainder };
  });



  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = income.reduce((s, i) => s + Number(i.total_amount), 0);

  function handleExport() {
    try {
      exportMonthlyReport({ monthYear, deals, managers, plans, expenses, income, transfers });
      toast.success(`Отчёт за ${monthYearToLabel(monthYear)} скачан`);
    } catch {
      toast.error('Не удалось сформировать Excel-файл');
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Отчёты</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Аналитика продаж и финансов</p>
          </div>
          <div className="flex items-center gap-2">
            <MonthYearPicker value={monthYear} onChange={setMonthYear} />
            {locked && (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Lock size={11} />Закрыт
              </span>
            )}
            {isDirector && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={lockBusy}>
                    {locked ? <Unlock size={14} className="mr-1.5" /> : <Lock size={14} className="mr-1.5" />}
                    {locked ? 'Открыть месяц' : 'Закрыть месяц'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{locked ? 'Открыть' : 'Закрыть'} {monthYearToLabel(monthYear)}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {locked
                        ? 'Сделки, расходы и поступления этого месяца снова можно будет редактировать.'
                        : 'После закрытия сделки, расходы и поступления этого месяца нельзя будет добавлять или редактировать — защита выданных зарплат и отчётов от случайных задних изменений.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleToggleLock}>{locked ? 'Открыть' : 'Закрыть'}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="outline" onClick={handleExport} disabled={loading}>
              <Download size={14} className="mr-1.5" />
              Excel
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* ── Month KPIs ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Всего сделок', value: deals.length, currency: false },
                { label: 'Общая выручка', value: deals.reduce((s, d) => s + Number(d.total_amount), 0), currency: true },
                { label: 'Оплачено', value: totalPaid, currency: true },
                { label: 'Остатки', value: deals.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0), currency: true },
              ].map(({ label, value, currency }) => (
                <div key={label} className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-base font-semibold mt-1">{currency ? formatCurrency(value as number) : value}</p>
                </div>
              ))}
            </div>

            {/* ── Per-manager summary ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">По менеджерам — {monthYearToLabel(monthYear)}</CardTitle>
              </CardHeader>
              <CardContent>
                {managerSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Нет данных</p>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Менеджер</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Сделок</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Выручка</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Оплачено</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Остатки</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Ср. чек</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {managerSummary.map(({ manager, count, revenue, paid, remainder }) => (
                          <TableRow key={manager.id}>
                            <TableCell className="whitespace-nowrap font-medium text-sm">{manager.name}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-right">{count}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(revenue)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(paid)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(remainder)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-right">{count > 0 ? formatCurrency(revenue / count) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Payment method breakdown ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Распределение по способам оплаты</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Нет сделок за этот месяц</p>
                ) : (
                  <div className="space-y-2">
                    {paymentBreakdown.map(({ method, sum, count }) => {
                      const pct = totalPaid > 0 ? (sum / totalPaid) * 100 : 0;
                      return (
                        <div key={method}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="font-medium">{method}</span>
                            <span className="text-muted-foreground">{formatCurrency(sum)} · {count} сд. · {pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Overall finance summary ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Сводный финансовый итог</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Все поступления', value: totalIncome },
                    { label: 'Все расходы', value: totalExpenses },
                    { label: 'Итого баланс', value: totalIncome - totalExpenses },
                    { label: 'Поступлений записей', value: income.length, currency: false },
                  ].map(({ label, value, currency = true }) => (
                    <div key={label} className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-base font-semibold mt-1 ${typeof value === 'number' && value < 0 ? 'text-destructive' : ''}`}>
                        {currency ? formatCurrency(value as number) : value}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
