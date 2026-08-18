import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, TrendingUp, Percent } from 'lucide-react';
import {
  getProfitRows, upsertProfitRow, deleteProfitRow,
  getAllDealsForMonth, getExpenses, getSalarySettings, getManagers,
} from '@/lib/api';
import { formatCurrency, getCurrentMonthYear, getAvailableMonths, monthYearToLabel } from '@/lib/utils';
import type { ProfitRow } from '@/types/types';
import { SALES_ROLES } from '@/types/types';

// ─── Вычислитель формул ────────────────────────────────────────────────────────
// Поддерживает: числа, +, -, *, /, скобки, переменные {revenue}, {expenses}, {salary}
function evalFormula(formula: string, vars: Record<string, number>): number {
  try {
    let expr = formula.trim();
    if (!expr) return 0;
    Object.entries(vars).forEach(([k, v]) => {
      expr = expr.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
    if (!/^[\d\s+\-*/().]+$/.test(expr)) return 0;
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch { return 0; }
}

type RowDraft = Omit<ProfitRow, 'created_at' | 'updated_at'>;

// Тип строки для отображения
type RowDisplayType = 'formula' | 'percentage_of_revenue';

export default function ProfitPage() {
  const [monthYear, setMonthYear] = useState(getCurrentMonthYear());
  const [rows, setRows]           = useState<RowDraft[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  // Авто-переменные из других разделов
  const [autoVars, setAutoVars]   = useState({ revenue: 0, expenses: 0, salary: 0 });

  const months = getAvailableMonths();

  const loadAutoVars = useCallback(async (my: string) => {
    try {
      const [deals, exps, setts, mgrs] = await Promise.all([
        getAllDealsForMonth(my),
        getExpenses(),
        getSalarySettings(),
        getManagers(),
      ]);
      const approved = deals.filter(d => d.status === 'approved');
      const revenue  = approved.reduce((s, d) => s + Number(d.salary_amount ?? d.total_amount), 0);
      const expenses = exps.reduce((s, e) => s + Number(e.amount), 0);
      // Зарплата: оклад + комиссия
      const salary = mgrs.reduce((s, m) => {
        const sett = setts.find(ss => ss.manager_id === m.id);
        const usePersonal = sett?.use_personal_revenue ?? SALES_ROLES.includes(m.role);
        const base = Number(sett?.base_salary ?? 0);
        const pct  = Number(sett?.commission_pct ?? 0);
        const rev  = usePersonal
          ? approved.filter(d => d.manager_id === m.id).reduce((a, d) => a + Number(d.salary_amount ?? d.total_amount), 0)
          : revenue;
        return s + base + rev * (pct / 100);
      }, 0);
      setAutoVars({ revenue, expenses, salary });
    } catch { /* silent */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dbRows] = await Promise.all([getProfitRows(monthYear), loadAutoVars(monthYear)]);
      if (dbRows.length === 0) {
        setRows([
          { id: `new-1`, sort_order: 0, label: 'Выручка',    formula: '{revenue}',              value: 0, is_auto: true,  row_type: 'revenue',  row_type_v2: 'revenue',  percent: 0, month_year: monthYear },
          { id: `new-2`, sort_order: 1, label: 'Расходы',    formula: '{expenses}',             value: 0, is_auto: true,  row_type: 'expenses', row_type_v2: 'expenses', percent: 0, month_year: monthYear },
          { id: `new-3`, sort_order: 2, label: 'ФОТ',        formula: '{salary}',               value: 0, is_auto: true,  row_type: 'salary',   row_type_v2: 'salary',   percent: 0, month_year: monthYear },
          { id: `new-4`, sort_order: 3, label: 'Чистая прибыль', formula: '{revenue}-{expenses}-{salary}', value: 0, is_auto: false, row_type: 'manual', row_type_v2: 'formula', percent: 0, month_year: monthYear },
        ]);
      } else {
        setRows(dbRows.map(r => ({
          ...r,
          row_type_v2: r.row_type_v2 ?? (r.row_type === 'manual' ? 'formula' : r.row_type),
          percent: r.percent ?? 0,
        })));
      }
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [monthYear, loadAutoVars]);

  useEffect(() => { load(); }, [load]);

  // Вычисляем значения строк с подстановкой авто-переменных
  function computedValue(row: RowDraft): number {
    const type = row.row_type_v2 ?? (row.row_type === 'manual' ? 'formula' : row.row_type);
    if (type === 'percentage_of_revenue') {
      return autoVars.revenue * (Number(row.percent) / 100);
    }
    return evalFormula(row.formula, autoVars);
  }

  // Итог (последняя строка)
  const totalProfit = computedValue(rows[rows.length - 1] ?? { formula: '', value: 0, row_type_v2: 'formula', percent: 0 } as RowDraft);

  async function saveAll() {
    setSaving(true);
    try {
      await Promise.all(rows.map((r, i) => {
        const payload = { ...r, sort_order: i, month_year: monthYear };
        if (r.id.startsWith('new-')) {
          const { id: _id, ...rest } = payload;
          return upsertProfitRow({ ...rest } as Parameters<typeof upsertProfitRow>[0]);
        }
        return upsertProfitRow(payload);
      }));
      toast.success('Сохранено');
      await load();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  }

  function updateRow(idx: number, field: keyof RowDraft, value: string | number | boolean) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function addRow(type: RowDisplayType = 'formula') {
    const newRow: RowDraft = {
      id: `new-${Date.now()}`,
      sort_order: rows.length,
      label: '',
      formula: type === 'percentage_of_revenue' ? '' : '',
      value: 0,
      is_auto: false,
      row_type: 'manual',
      row_type_v2: type,
      percent: type === 'percentage_of_revenue' ? 10 : 0,
      month_year: monthYear,
    };
    setRows(prev => [...prev, newRow]);
  }

  async function removeRow(idx: number) {
    const row = rows[idx];
    if (!row.id.startsWith('new-')) {
      try { await deleteProfitRow(row.id); } catch { toast.error('Ошибка удаления'); return; }
    }
    setRows(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Заголовок */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <TrendingUp size={20} className="text-primary" />
              Чистая прибыль
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Расчёт P&amp;L. Формулы: <code className="text-xs bg-muted px-1 rounded">{'{revenue}'}</code>{' '}
              <code className="text-xs bg-muted px-1 rounded">{'{expenses}'}</code>{' '}
              <code className="text-xs bg-muted px-1 rounded">{'{salary}'}</code>
            </p>
          </div>
          <Select value={monthYear} onValueChange={setMonthYear}>
            <SelectTrigger className="w-52 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m} value={m}>{monthYearToLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Авто-переменные */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'revenue',  label: 'Выручка (авто)',  val: autoVars.revenue  },
            { key: 'expenses', label: 'Расходы (авто)',  val: autoVars.expenses },
            { key: 'salary',   label: 'ФОТ (авто)',      val: autoVars.salary   },
          ].map(({ key, label, val }) => (
            <div key={key} className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold mt-0.5">{formatCurrency(val)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{`{${key}}`}</p>
            </div>
          ))}
        </div>

        {/* Таблица строк */}
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Строки расчёта</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Добавляйте строки с формулами или процентами от выручки (например: Логистика 10%, Маркетинг 15%)
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : (
              <>
                {rows.map((row, idx) => {
                  const computed = computedValue(row);
                  const displayType = row.row_type_v2 ?? (row.row_type === 'manual' ? 'formula' : row.row_type);
                  const isPct = displayType === 'percentage_of_revenue';

                  return (
                    <div key={row.id} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card flex-wrap md:flex-nowrap">
                      <GripVertical size={14} className="text-muted-foreground/40 shrink-0" />

                      {/* Название */}
                      <Input
                        className="h-8 text-sm w-36 min-w-[100px]"
                        placeholder="Название"
                        value={row.label}
                        onChange={e => updateRow(idx, 'label', e.target.value)}
                      />

                      {/* Тип строки */}
                      <Select
                        value={displayType}
                        onValueChange={v => {
                          updateRow(idx, 'row_type_v2', v);
                          if (v === 'percentage_of_revenue') {
                            updateRow(idx, 'formula', '');
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs w-48 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="formula">Формула</SelectItem>
                          <SelectItem value="percentage_of_revenue">% от выручки</SelectItem>
                          <SelectItem value="revenue">Выручка (авто)</SelectItem>
                          <SelectItem value="expenses">Расходы (авто)</SelectItem>
                          <SelectItem value="salary">ФОТ (авто)</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Поле ввода: формула или процент */}
                      {isPct ? (
                        <div className="flex items-center gap-1 min-w-[120px] flex-1">
                          <Input
                            className="h-8 text-sm w-20"
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            placeholder="10"
                            value={row.percent ?? ''}
                            onChange={e => updateRow(idx, 'percent', Number(e.target.value))}
                          />
                          <span className="text-muted-foreground shrink-0"><Percent size={12} /></span>
                          <Badge variant="secondary" className="text-xs font-normal shrink-0">
                            от {formatCurrency(autoVars.revenue)}
                          </Badge>
                        </div>
                      ) : (
                        <Input
                          className="h-8 text-sm flex-1 min-w-[140px] font-mono"
                          placeholder="{revenue} - {expenses}"
                          value={row.formula}
                          disabled={['revenue','expenses','salary'].includes(displayType)}
                          onChange={e => updateRow(idx, 'formula', e.target.value)}
                        />
                      )}

                      {/* Результат */}
                      <span className="text-sm font-semibold tabular-nums whitespace-nowrap w-32 text-right shrink-0">
                        {formatCurrency(computed)}
                      </span>

                      {/* Удалить */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 size={13} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить строку?</AlertDialogTitle>
                            <AlertDialogDescription>«{row.label || 'Без названия'}» будет удалена.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => removeRow(idx)}
                            >Удалить</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  );
                })}

                {/* Итог */}
                {rows.length > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {rows[rows.length - 1]?.label || 'Итог'}
                    </span>
                    <span className={`text-base font-semibold tabular-nums ${totalProfit >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                      {formatCurrency(totalProfit)}
                    </span>
                  </div>
                )}

                <div className="flex gap-2 pt-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => addRow('formula')}>
                    <Plus size={14} className="mr-1" />Добавить строку
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => addRow('percentage_of_revenue')}>
                    <Percent size={14} className="mr-1" />Добавить % от выручки
                  </Button>
                  <Button size="sm" onClick={saveAll} disabled={saving}>
                    {saving ? 'Сохранение...' : 'Сохранить'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

