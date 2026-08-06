import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getManagers, getDeals, getSalesPlans, upsertSalesPlan } from '@/lib/api';
import { getCurrentMonthYear, getAvailableMonths, monthYearToLabel } from '@/lib/utils';
import type { Manager, Deal, SalesPlan } from '@/types/types';
import { ROLES, SALES_PAGE_ROLES } from '@/types/types';
import ManagerSalesSection from '@/components/sales/ManagerSalesSection';

export default function SalesPage() {
  const { isAdmin, profile } = useAuth();
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const [managers, setManagers]   = useState<Manager[]>([]);
  const [deals, setDeals]         = useState<Record<string, Deal[]>>({});
  const [plans, setPlans]         = useState<SalesPlan[]>([]);
  const [loading, setLoading]     = useState(true);

  // Filters (admin-only)
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
      // Read from latest ref snapshot to avoid stale closure
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

  // ── Filtering ──────────────────────────────────────────────────────────────
  // Employees always see only their own manager section
  // Admins see all by default (filtered to sales roles), can switch role/employee
  const visibleManagers = managers.filter(m => {
    if (!isAdmin) {
      // employee sees only their own section
      return m.id === profile?.manager_id;
    }
    // admin: role filter
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    // admin: employee filter
    if (employeeFilter !== 'all' && m.id !== employeeFilter) return false;
    // admin default: show only sales roles unless filter overridden
    if (roleFilter === 'all' && !SALES_PAGE_ROLES.includes(m.role)) return false;
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
            {/* Role filter */}
            <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setEmployeeFilter('all'); }}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue placeholder="Должность" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Только менеджеры (по умолч.)</SelectItem>
                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Employee filter */}
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="Сотрудник" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
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
            {isAdmin && <p className="text-sm mt-1">Измените фильтр или добавьте сотрудников.</p>}
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
                onPlanChange={isAdmin ? handlePlanChange : undefined}
                onRefresh={loadData}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
