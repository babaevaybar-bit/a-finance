import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { getAllDeals, getManagers, getSalesPlans } from '@/lib/api';
import {
  formatCurrency, getAvailableMonths, monthYearToLabel, getCurrentMonthYear,
} from '@/lib/utils';
import type { Deal, Manager, SalesPlan } from '@/types/types';
import { TrendingUp, ShoppingCart, Users, Wallet } from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
const MANAGER_COLORS = [
  'hsl(220,70%,45%)',
  'hsl(200,60%,50%)',
  'hsl(170,55%,42%)',
  'hsl(260,55%,55%)',
  'hsl(30,70%,50%)',
];

interface MonthRow {
  month: string;      // label «июль 2026»
  monthYear: string;  // «2026-07»
  [managerId: string]: number | string;
}

function buildChartData(deals: Deal[], managers: Manager[], months: string[]): MonthRow[] {
  return months.map(my => {
    const row: MonthRow = { month: monthYearToLabel(my), monthYear: my };
    managers.forEach(m => {
      row[m.id] = deals
        .filter(d => d.manager_id === m.id && d.month_year === my)
        .reduce((s, d) => s + Number(d.total_amount), 0);
    });
    return row;
  });
}

// ─── custom tooltip ───────────────────────────────────────────────────────────
interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [plans, setPlans] = useState<SalesPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const months = getAvailableMonths();
  const currentMonth = getCurrentMonthYear();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allDeals, mgrs, curPlans] = await Promise.all([
        getAllDeals(),
        getManagers(),
        getSalesPlans(currentMonth),
      ]);
      setDeals(allDeals);
      setManagers(mgrs);
      setPlans(curPlans);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { load(); }, [load]);

  // KPI — current month
  const currentDeals = deals.filter(d => d.month_year === currentMonth);
  const totalRevenueCurrent = currentDeals.reduce((s, d) => s + Number(d.total_amount), 0);
  const totalPaidCurrent = currentDeals.reduce((s, d) => s + Number(d.paid_amount), 0);
  const totalRemainder = currentDeals.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0);

  // Best manager this month
  const bestManager = managers.reduce<{ name: string; revenue: number }>(
    (best, m) => {
      const rev = currentDeals.filter(d => d.manager_id === m.id).reduce((s, d) => s + Number(d.total_amount), 0);
      return rev > best.revenue ? { name: m.name, revenue: rev } : best;
    },
    { name: '—', revenue: 0 }
  );

  // Chart data
  const chartData = buildChartData(deals, managers, months);

  // Total plan vs actual (current month)
  const totalPlan = plans.reduce((s, p) => s + Number(p.plan_amount), 0);
  const planProgress = totalPlan > 0 ? Math.min(100, (totalRevenueCurrent / totalPlan) * 100) : 0;

  // Line chart: overall revenue trend
  const trendData = months.map(my => ({
    month: monthYearToLabel(my),
    revenue: deals.filter(d => d.month_year === my).reduce((s, d) => s + Number(d.total_amount), 0),
    paid: deals.filter(d => d.month_year === my).reduce((s, d) => s + Number(d.paid_amount), 0),
  }));

  const kpis = [
    { label: 'Выручка (месяц)', value: formatCurrency(totalRevenueCurrent), icon: TrendingUp, sub: `план: ${formatCurrency(totalPlan)}` },
    { label: 'Оплачено', value: formatCurrency(totalPaidCurrent), icon: Wallet, sub: `остатки: ${formatCurrency(totalRemainder)}` },
    { label: 'Сделок (месяц)', value: currentDeals.length, icon: ShoppingCart, sub: `всего: ${deals.length}` },
    { label: 'Лучший менеджер', value: bestManager.name, icon: Users, sub: formatCurrency(bestManager.revenue) },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold">Дашборд</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {monthYearToLabel(currentMonth)} — сводка показателей
          </p>
        </div>

        {/* KPI cards */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map(({ label, value, icon: Icon, sub }) => (
              <Card key={label} className="border border-border">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-lg font-semibold mt-0.5 truncate">{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                    </div>
                    <div className="shrink-0 w-8 h-8 rounded-md bg-primary/8 flex items-center justify-center">
                      <Icon size={15} className="text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Plan progress bar — company total (sum of individual plans) */}
        {!loading && (
          <div className="rounded-md border border-border p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
              <span className="text-sm font-medium">
                Общий план компании — {monthYearToLabel(currentMonth)}
              </span>
              <span className="text-xs text-muted-foreground">
                Задаётся индивидуально для каждого сотрудника на странице Продажи
              </span>
            </div>
            {totalPlan > 0 ? (
              <>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Факт: {formatCurrency(totalRevenueCurrent)}</span>
                  <span>{planProgress.toFixed(1)}% от {formatCurrency(totalPlan)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700"
                    style={{ width: `${planProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Планы не заданы. Перейдите в раздел «Продажи» и установите план для каждого менеджера.
              </p>
            )}
          </div>
        )}

        {/* Bar chart: revenue by manager per month */}
        {loading ? (
          <div className="h-72 rounded-lg bg-muted animate-pulse" />
        ) : (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Выручка по менеджерам (по месяцам)</CardTitle>
            </CardHeader>
            <CardContent>
              {managers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">Нет данных</p>
              ) : (
                <div className="w-full min-w-0 overflow-hidden">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => {
                          // Abbreviate: «июль 2026» → «июл '26»
                          const parts = v.split(' ');
                          return parts.length >= 2 ? `${parts[0].slice(0, 3)} '${parts[1].slice(2)}` : v;
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                        width={52}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        layout="horizontal"
                      />
                      {managers.map((m, i) => (
                        <Bar
                          key={m.id}
                          dataKey={m.id}
                          name={m.name}
                          fill={MANAGER_COLORS[i % MANAGER_COLORS.length]}
                          radius={[2, 2, 0, 0]}
                          maxBarSize={40}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Line chart: overall revenue trend */}
        {!loading && (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Динамика выручки (общая)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => {
                        const parts = v.split(' ');
                        return parts.length >= 2 ? `${parts[0].slice(0, 3)} '${parts[1].slice(2)}` : v;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                      width={52}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} layout="horizontal" />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Выручка"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="paid"
                      name="Оплачено"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={{ r: 3, fill: 'hsl(var(--chart-2))' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Per-manager current month table */}
        {!loading && managers.length > 0 && (
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Итог по менеджерам — {monthYearToLabel(currentMonth)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left whitespace-nowrap py-2 pr-4 font-medium text-muted-foreground">Менеджер</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">Сделок</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">Выручка</th>
                      <th className="text-right whitespace-nowrap py-2 px-3 font-medium text-muted-foreground">Оплачено</th>
                      <th className="text-right whitespace-nowrap py-2 pl-3 font-medium text-muted-foreground">% плана</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((m, i) => {
                      const mDeals = currentDeals.filter(d => d.manager_id === m.id);
                      const rev = mDeals.reduce((s, d) => s + Number(d.total_amount), 0);
                      const paid = mDeals.reduce((s, d) => s + Number(d.paid_amount), 0);
                      const plan = plans.find(p => p.manager_id === m.id);
                      const planAmt = Number(plan?.plan_amount || 0);
                      const pct = planAmt > 0 ? Math.min(999, (rev / planAmt) * 100) : null;
                      return (
                        <tr key={m.id} className="border-b border-border last:border-0">
                          <td className="whitespace-nowrap py-2.5 pr-4">
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-2"
                              style={{ background: MANAGER_COLORS[i % MANAGER_COLORS.length] }}
                            />
                            {m.name}
                          </td>
                          <td className="whitespace-nowrap py-2.5 px-3 text-right tabular-nums">{mDeals.length}</td>
                          <td className="whitespace-nowrap py-2.5 px-3 text-right tabular-nums font-medium">{formatCurrency(rev)}</td>
                          <td className="whitespace-nowrap py-2.5 px-3 text-right tabular-nums">{formatCurrency(paid)}</td>
                          <td className="whitespace-nowrap py-2.5 pl-3 text-right tabular-nums">
                            {pct !== null ? (
                              <span className={pct >= 100 ? 'text-primary font-medium' : 'text-muted-foreground'}>
                                {pct.toFixed(1)}%
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
