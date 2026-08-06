import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { deleteDeal } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, SalesPlan } from '@/types/types';
import DealFormDialog from './DealFormDialog';

interface Props {
  manager: { id: string; name: string; role?: string };
  monthYear: string;
  deals: Deal[];
  plan: SalesPlan | undefined;
  onPlanChange?: (managerId: string, field: 'plan_amount' | 'net_profit_plan' | 'dividends_plan', value: number) => void;
  onRefresh: () => void;
}

export default function ManagerSalesSection({ manager, monthYear, deals, plan, onPlanChange, onRefresh }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);

  const totalAmount = deals.reduce((s, d) => s + Number(d.total_amount), 0);
  const totalPaid = deals.reduce((s, d) => s + Number(d.paid_amount), 0);
  const totalRemainder = deals.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0);

  const planAmount = Number(plan?.plan_amount || 0);
  const progress = planAmount > 0 ? Math.min(100, (totalAmount / planAmount) * 100) : 0;
  const missing = Math.max(0, planAmount - totalAmount);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteDeal(id);
      toast.success('Сделка удалена');
      onRefresh();
    } catch {
      toast.error('Не удалось удалить сделку');
    }
  }, [onRefresh]);

  return (
    <Card className="border border-border">
      {/* Header */}
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 flex-1 min-w-0">
            <span className="truncate">{manager.name}</span>
            <span className="text-xs font-normal text-muted-foreground shrink-0">
              {deals.length} сделок
            </span>
            {collapsed ? <ChevronRight size={16} className="shrink-0 text-muted-foreground" /> : <ChevronDown size={16} className="shrink-0 text-muted-foreground" />}
          </CardTitle>
          <div className="flex items-center gap-4 shrink-0 text-sm" onClick={e => e.stopPropagation()}>
            <span className="text-muted-foreground hidden md:inline">Выручка:</span>
            <span className="font-semibold text-foreground">{formatCurrency(totalAmount)}</span>
          </div>
        </div>

        {/* Plan progress bar */}
        {planAmount > 0 && (
          <div className="mt-2" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Прогресс плана: {progress.toFixed(1)}%</span>
              <span>Не хватает: {formatCurrency(missing)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0 space-y-4">
          {/* Plan settings — admin only (onPlanChange provided) */}
          {onPlanChange && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-md bg-muted/50 border border-border">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">План продаж (₸)</label>
              <Input
                type="number" min="0"
                placeholder="0"
                value={plan?.plan_amount || ''}
                onChange={e => onPlanChange(manager.id, 'plan_amount', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">План чистой прибыли (₸)</label>
              <Input
                type="number" min="0"
                placeholder="0"
                value={plan?.net_profit_plan || ''}
                onChange={e => onPlanChange(manager.id, 'net_profit_plan', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">План дивидендов (₸)</label>
              <Input
                type="number" min="0"
                placeholder="0"
                value={plan?.dividends_plan || ''}
                onChange={e => onPlanChange(manager.id, 'dividends_plan', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Общая выручка', value: totalAmount },
              { label: 'Оплачено',      value: totalPaid },
              { label: 'Остатки',       value: totalRemainder },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold mt-0.5">{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          {/* Deals table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Сделки</span>
              <Button size="sm" variant="outline" onClick={() => { setEditDeal(null); setFormOpen(true); }}>
                <Plus size={14} className="mr-1" />
                Добавить
              </Button>
            </div>

            {deals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Нет сделок за этот месяц</p>
            ) : (
              <div className="w-full overflow-x-auto rounded-md border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Дата</TableHead>
                      <TableHead className="whitespace-nowrap">ФИО</TableHead>
                      <TableHead className="whitespace-nowrap">Оплата</TableHead>
                      <TableHead className="whitespace-nowrap">Модель</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Сумма</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Оплачено</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Остаток</TableHead>
                      <TableHead className="whitespace-nowrap text-right">ЗП база</TableHead>
                      <TableHead className="whitespace-nowrap">Комментарий</TableHead>
                      <TableHead className="whitespace-nowrap w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals.map(d => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(d.deal_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{d.client_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{d.payment_method}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm max-w-[150px] truncate">{d.door_model || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(d.total_amount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(d.paid_amount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(Math.max(0, d.total_amount - d.paid_amount))}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right text-muted-foreground">
                          {d.salary_amount !== null && d.salary_amount !== undefined
                            ? formatCurrency(d.salary_amount)
                            : <span className="italic text-muted-foreground/50">авто</span>}
                        </TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{d.comment || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => { setEditDeal(d); setFormOpen(true); }}>
                              <Pencil size={12} />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                  <Trash2 size={12} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Удалить сделку?</AlertDialogTitle>
                                  <AlertDialogDescription>Это действие необратимо.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDelete(d.id)}
                                  >Удалить</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      )}

      <DealFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={onRefresh}
        managerId={manager.id}
        monthYear={monthYear}
        deal={editDeal}
      />
    </Card>
  );
}
