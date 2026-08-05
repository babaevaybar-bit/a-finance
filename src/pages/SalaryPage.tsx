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
  getManagers, getSalarySettings, upsertSalarySetting,
  getAllDealsForMonth,
} from '@/lib/api';
import {
  formatCurrency, getCurrentMonthYear, getAvailableMonths, monthYearToLabel,
} from '@/lib/utils';
import type { Manager, SalarySetting, Deal } from '@/types/types';
import { SALES_ROLES } from '@/types/types';

// ─── row with inline edit ──────────────────────────────────────────────────────
interface RowProps {
  manager: Manager;
  setting: SalarySetting | undefined;
  revenue: number;         // личные сделки менеджера
  companyRevenue: number;  // общая выручка компании
  onSaved: () => void;
}

function ManagerSalaryRow({ manager, setting, revenue, companyRevenue, onSaved }: RowProps) {
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
export default function SalaryPage() {
  const [managers, setManagers]   = useState<Manager[]>([]);
  const [settings, setSettings]   = useState<SalarySetting[]>([]);
  const [deals, setDeals]         = useState<Deal[]>([]);
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const [loading, setLoading]     = useState(true);

  const months = getAvailableMonths();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, setts, dls] = await Promise.all([
        getManagers(),
        getSalarySettings(),
        getAllDealsForMonth(monthYear),
      ]);
      setManagers(mgrs); setSettings(setts); setDeals(dls);
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
          <Select value={monthYear} onValueChange={setMonthYear}>
            <SelectTrigger className="w-52 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m} value={m}>{monthYearToLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
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
                       />
                    ))}
                    <tr className="border-t border-border bg-muted/30">
                      <td className="py-2.5 pr-4 text-sm font-semibold" colSpan={6}>ИТОГО ФОТ</td>
                      <td className="py-2.5 pl-3 text-right text-sm font-semibold tabular-nums">{formatCurrency(totalSalary)}</td>
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
    </AppLayout>
  );
}

