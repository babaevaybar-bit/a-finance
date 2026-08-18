import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { getManagers, getDeals, getSalesPlans, upsertSalesPlan, getLastDealsMonth } from '@/lib/api';
import { getCurrentMonthYear, getAvailableMonths, monthYearToLabel } from '@/lib/utils';
import type { Manager, Deal, SalesPlan } from '@/types/types';
import { ROLES, SALES_PAGE_ROLES } from '@/types/types';
import ManagerSalesSection from '@/components/sales/ManagerSalesSection';
import { useAuth } from '@/contexts/AuthContext';

export default function SalesPage() {
  const { profile, isAdmin } = useAuth();
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const isInitialLoad = useRef(true); // флаг первой загрузки для автопереключения
  const [managers, setManagers]   = useState<Manager[]>([]);
  const [deals, setDeals]         = useState<Record<string, Deal[]>>({});
  const [plans, setPlans]         = useState<SalesPlan[]>([]);
  const [loading, setLoading]     = useState(true);

  // Filters
  const [roleFilter, setRoleFilter]         = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');

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

  // ── Filtering — show only SALES_PAGE_ROLES by default ──────────────────────
  // Non-admin: see only own manager record
  const visibleManagers = managers.filter(m => {
    if (!isAdmin) {
      // employee sees only their own manager record
      return m.user_id === profile?.id;
    }
    if (roleFilter !== 'all') {
      if (m.role !== roleFilter) return false;
    } else {
      if (!SALES_PAGE_ROLES.includes(m.role)) return false;
    }
    if (employeeFilter !== 'all' && m.id !== employeeFilter) return false;
    return true;
  });

  const months = getAvailableMonths();

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Продажи</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Учёт сделок по сотрудникам</p>
          </div>
          <Select value={monthYear} onValueChange={setMonthYear}>
            <SelectTrigger className="w-52 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m} value={m}>{monthYearToLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Filters — admin only */}
        {isAdmin && (
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

          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="Все сотрудники" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сотрудники</SelectItem>
              {managers
                .filter(m => roleFilter === 'all' ? SALES_PAGE_ROLES.includes(m.role) : m.role === roleFilter)
                .map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {(roleFilter !== 'all' || employeeFilter !== 'all') && (
            <Button variant="ghost" size="sm" className="h-8 text-xs"
              onClick={() => { setRoleFilter('all'); setEmployeeFilter('all'); }}>
              Сбросить
            </Button>
          )}
        </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : visibleManagers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>Нет сотрудников для отображения.</p>
            <p className="text-sm mt-1">Измените фильтр или добавьте сотрудников.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleManagers.map(m => (
              <ManagerSalesSection
                key={m.id}
                manager={m}
                monthYear={monthYear}
                deals={deals[m.id] || []}
                plan={getPlan(m.id)}
                onPlanChange={handlePlanChange}
                onRefresh={loadData}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
