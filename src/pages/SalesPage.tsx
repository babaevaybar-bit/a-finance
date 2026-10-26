import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { getManagers, getDeals, getSalesPlans, upsertSalesPlan, getLastDealsMonth } from '@/lib/api';
import { getCurrentMonthYear, formatCurrency } from '@/lib/utils';
import { Users } from 'lucide-react';
import MonthYearPicker from '@/components/common/MonthYearPicker';
import type { Manager, Deal, SalesPlan } from '@/types/types';
import { ROLES, SALES_PAGE_ROLES } from '@/types/types';
import ManagerSalesSection from '@/components/sales/ManagerSalesSection';
import { useAuth } from '@/contexts/AuthContext';

export default function SalesPage() {
  const { profile, isAdmin, isDirector, seesAll } = useAuth();
  const canViewAllManagers = seesAll('sales');
  const [searchParams, setSearchParams] = useSearchParams();
  // Открытие по ссылке с дашборда (?manager=ID&month=YYYY-MM) — сразу показываем нужного менеджера и месяц
  const [monthYear, setMonthYear] = useState(searchParams.get('month') || getCurrentMonthYear());
  const isInitialLoad = useRef(true); // флаг первой загрузки для автопереключения
  const [managers, setManagers]   = useState<Manager[]>([]);
  const [deals, setDeals]         = useState<Record<string, Deal[]>>({});
  const [plans, setPlans]         = useState<SalesPlan[]>([]);
  const [loading, setLoading]     = useState(true);

  // Filters
  const [roleFilter, setRoleFilter]         = useState<string>('all');
  // Выбранный в сводке менеджер ('all' — сделки всех одной таблицей)
  const [employeeFilter, setEmployeeFilterState] = useState<string>(() => {
    const fromUrl = searchParams.get('manager');
    if (fromUrl) return fromUrl;
    try { return localStorage.getItem('sales_selected_manager') || 'all'; } catch { return 'all'; }
  });
  const setEmployeeFilter = (v: string) => {
    setEmployeeFilterState(v);
    try { localStorage.setItem('sales_selected_manager', v); } catch { /* ignore */ }
  };

  // Ссылка с дашборда одноразовая — после применения фильтра убираем из URL,
  // чтобы обычная навигация/обновление страницы не «залипало» на ней
  useEffect(() => {
    if (searchParams.get('manager') || searchParams.get('month')) {
      isInitialLoad.current = false;
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const mgrs = await getManagers();
      setManagers(mgrs);
      const [allPlans, ...dealsByManager] = await Promise.all([
        getSalesPlans(monthYear),
        ...mgrs.map(m => getDeals(m.id, monthYear)),
      ]);
      setPlans(allPlans as SalesPlan[]);
      const dealsMap: Record<string, Deal[]> = {};
      mgrs.forEach((m, i) => { dealsMap[m.id] = dealsByManager[i] as Deal[]; });
      setDeals(dealsMap);

      // Автопереключение на последний месяц с данными — ТОЛЬКО при первом открытии.
      // При ручной смене месяца пользователем этот блок не выполняется.
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        const totalThisMonth = (dealsByManager as Deal[][]).reduce((s, arr) => s + arr.length, 0);
        if (totalThisMonth === 0) {
          const lastMonth = await getLastDealsMonth();
          if (lastMonth && lastMonth !== monthYear) {
            setMonthYear(lastMonth); // useEffect перезапустит loadData с нужным месяцем
          }
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [monthYear]);

  useEffect(() => { loadData(); }, [loadData]);

  function getPlan(managerId: string): SalesPlan | undefined {
    return plans.find(p => p.manager_id === managerId && p.month_year === monthYear);
  }

  function handlePlanChange(managerId: string, field: 'plan_amount' | 'net_profit_plan' | 'dividends_plan', value: number) {
    setPlans(prev => {
      const existing = prev.find(p => p.manager_id === managerId && p.month_year === monthYear);
      if (existing) return prev.map(p => p.manager_id === managerId && p.month_year === monthYear ? { ...p, [field]: value } : p);
      return [...prev, { id: `temp-${managerId}`, manager_id: managerId, month_year: monthYear, plan_amount: 0, net_profit_plan: null, dividends_plan: null, created_at: '', updated_at: '', [field]: value }];
    });
    const key = `${managerId}:${monthYear}`;
    clearTimeout(planSaveTimers.current[key]);
    planSaveTimers.current[key] = setTimeout(async () => {
      const currentPlan = plans.find(p => p.manager_id === managerId && p.month_year === monthYear);
      const updated = { ...(currentPlan || { plan_amount: 0, net_profit_plan: null, dividends_plan: null }), [field]: value };
      await upsertSalesPlan({
        manager_id: managerId,
        month_year: monthYear,
        plan_amount: Number(updated.plan_amount) || 0,
        net_profit_plan: updated.net_profit_plan != null ? Number(updated.net_profit_plan) : null,
        dividends_plan: updated.dividends_plan != null ? Number(updated.dividends_plan) : null,
      });
    }, 800);
  }

  // ── Кого показываем: менеджер видит только себя; директор/РОП — по фильтру должности
  const roleManagers = managers.filter(m => {
    if (!canViewAllManagers) return m.user_id === profile?.id;
    if (roleFilter !== 'all') return m.role === roleFilter;
    return SALES_PAGE_ROLES.includes(m.role);
  });
  const selectedManager = employeeFilter !== 'all' ? roleManagers.find(m => m.id === employeeFilter) ?? null : null;

  // Сводка по каждому менеджеру для карточек сверху
  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const map: Record<string, { revenue: number; paid: number; debt: number; overdue: number; count: number; pending: number; plan: number }> = {};
    for (const m of roleManagers) {
      const list = deals[m.id] || [];
      const revenue = list.reduce((s, d) => s + Number(d.total_amount), 0);
      const paid = list.reduce((s, d) => s + Number(d.paid_amount), 0);
      const debt = list.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0);
      const overdue = list.filter(d => Number(d.total_amount) > Number(d.paid_amount) && !!d.next_payment_date && d.next_payment_date < today).length;
      const pending = list.filter(d => d.status === 'pending').length;
      const plan = Number(plans.find(p => p.manager_id === m.id && p.month_year === monthYear)?.plan_amount || 0);
      map[m.id] = { revenue, paid, debt, overdue, count: list.length, pending, plan };
    }
    return map;
  }, [roleManagers, deals, plans, monthYear, today]);

  const totals = useMemo(() => Object.values(stats).reduce((t, x) => ({
    revenue: t.revenue + x.revenue, debt: t.debt + x.debt, count: t.count + x.count,
    overdue: t.overdue + x.overdue, plan: t.plan + x.plan, pending: t.pending + x.pending,
  }), { revenue: 0, debt: 0, count: 0, overdue: 0, plan: 0, pending: 0 }), [stats]);

  const allDeals = useMemo(() => roleManagers.flatMap(m => deals[m.id] || []), [roleManagers, deals]);
  const managerNames = useMemo(() => Object.fromEntries(managers.map(m => [m.id, m.name])), [managers]);

  // Карточки: сначала с выручкой (по убыванию), потом без сделок
  const tiles = [...roleManagers].sort((a, b) => (stats[b.id]?.revenue ?? 0) - (stats[a.id]?.revenue ?? 0));

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Продажи</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Учёт сделок по сотрудникам</p>
          </div>
          <MonthYearPicker value={monthYear} onChange={setMonthYear} className="shrink-0" />
        </div>

        {/* Filters — director/rop only */}
        {canViewAllManagers && (
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setEmployeeFilter('all'); }}>
            <SelectTrigger className="w-52 h-8 text-sm">
              <SelectValue placeholder="Только менеджеры" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Только менеджеры</SelectItem>
              {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>

          {roleFilter !== 'all' && (
            <Button variant="ghost" size="sm" className="h-8 text-xs"
              onClick={() => { setRoleFilter('all'); setEmployeeFilter('all'); }}>
              Сбросить
            </Button>
          )}
        </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}</div>
            <div className="h-64 rounded-lg bg-muted animate-pulse" />
          </div>
        ) : roleManagers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>Нет сотрудников для отображения.</p>
            <p className="text-sm mt-1">Измените фильтр или добавьте сотрудников.</p>
          </div>
        ) : !canViewAllManagers ? (
          <div className="space-y-4">
            {roleManagers.map(m => (
              <ManagerSalesSection key={m.id} manager={m} monthYear={monthYear} deals={deals[m.id] || []}
                plan={getPlan(m.id)} onRefresh={loadData} forceOpen />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Сводка по менеджерам — все видно сразу */}
            <div className="grid gap-2 md:gap-3 grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
              <SummaryTile
                active={employeeFilter === 'all' || !selectedManager}
                onClick={() => setEmployeeFilter('all')}
                title={<span className="inline-flex items-center gap-1.5"><Users size={14} />Все</span>}
                revenue={totals.revenue} plan={totals.plan} count={totals.count} debt={totals.debt} overdue={totals.overdue} pending={totals.pending}
              />
              {tiles.map(m => {
                const st = stats[m.id];
                return (
                  <SummaryTile key={m.id}
                    active={selectedManager?.id === m.id}
                    onClick={() => setEmployeeFilter(m.id)}
                    title={m.name} muted={st.count === 0}
                    revenue={st.revenue} plan={st.plan} count={st.count} debt={st.debt} overdue={st.overdue} pending={st.pending}
                  />
                );
              })}
            </div>

            {/* Сделки выбранного менеджера — на всю ширину */}
            {selectedManager ? (
              <ManagerSalesSection
                key={selectedManager.id}
                manager={selectedManager}
                monthYear={monthYear}
                deals={deals[selectedManager.id] || []}
                plan={getPlan(selectedManager.id)}
                onPlanChange={isDirector ? handlePlanChange : undefined}
                onRefresh={loadData}
                forceOpen
              />
            ) : (
              <ManagerSalesSection
                key="all"
                manager={{ id: 'all', name: 'Все менеджеры' }}
                monthYear={monthYear}
                deals={allDeals}
                plan={totals.plan > 0 ? ({ plan_amount: totals.plan } as SalesPlan) : undefined}
                onRefresh={loadData}
                forceOpen
                managerNames={managerNames}
              />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Карточка менеджера в сводке: выручка, план, долги
function SummaryTile({ title, active, muted, onClick, revenue, plan, count, debt, overdue, pending }: {
  title: React.ReactNode; active: boolean; muted?: boolean; onClick: () => void;
  revenue: number; plan: number; count: number; debt: number; overdue: number; pending: number;
}) {
  const pct = plan > 0 ? (revenue / plan) * 100 : 0; // реальный %, может быть больше 100
  const missing = Math.max(0, plan - revenue);
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-col justify-start min-w-0 text-left rounded-xl border p-2.5 md:p-3 transition-all bg-card hover:shadow-sm ${active ? 'border-primary ring-2 ring-primary/25 shadow-sm' : 'border-border hover:border-primary/40'} ${muted && !active ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">{title}</span>
        <span className="text-[11px] text-muted-foreground shrink-0">{count} сд.</span>
      </div>
      <div className="text-base md:text-lg font-semibold tabular-nums mt-1 truncate">{formatCurrency(revenue)}</div>
      {plan > 0 ? (
        <div className="mt-1.5">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground mt-1 tabular-nums">
            <span>{pct.toFixed(0)}% плана</span>
            {missing > 0 ? <span className="truncate ml-1">−{formatCurrency(missing)}</span> : <span className="text-emerald-600">план выполнен</span>}
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground mt-1.5">план не задан</div>
      )}
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 text-[11px]">
        {debt > 0 && <span className="text-muted-foreground">долг <b className="font-medium text-foreground tabular-nums">{formatCurrency(debt)}</b></span>}
        {overdue > 0 && <span className="text-red-600 font-medium">просрочено {overdue}</span>}
        {pending > 0 && <span className="text-amber-600">на проверке {pending}</span>}
      </div>
    </button>
  );
}
