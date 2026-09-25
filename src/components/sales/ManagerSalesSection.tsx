import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Search, ArrowUpDown } from 'lucide-react';
import { deleteDeal } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, SalesPlan } from '@/types/types';
import { INSTALL_STAGE_LABELS, DEAL_STATUS_LABELS } from '@/types/types';
import DealFormDialog from './DealFormDialog';
import DealPayments from './DealPayments';
import TrelloLookup from '@/components/trello/TrelloLookup';

interface Props {
  manager: { id: string; name: string; role?: string };
  monthYear: string;
  deals: Deal[];
  plan: SalesPlan | undefined;
  onPlanChange?: (managerId: string, field: 'plan_amount' | 'net_profit_plan' | 'dividends_plan', value: number) => void;
  onRefresh: () => void;
}

type SortKey = 'deal_date' | 'total_amount' | 'remainder';

const STATUS_BADGE_VARIANT: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export default React.memo(function ManagerSalesSection({ manager, monthYear, deals, plan, onPlanChange, onRefresh }: Props) {
  const collapseKey = `sales_collapsed_${manager.id}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(collapseKey) === '1'; } catch { return false; }
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('deal_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { localStorage.setItem(collapseKey, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed, collapseKey]);

  // Сбрасываем выбор при смене месяца/менеджера, чтобы не удалить не то по ошибке
  useEffect(() => { setSelectedIds(new Set()); }, [monthYear, manager.id]);

  const totalAmount = deals.reduce((s, d) => s + Number(d.total_amount), 0);
  const totalPaid = deals.reduce((s, d) => s + Number(d.paid_amount), 0);
  const totalRemainder = deals.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0);

  const planAmount = Number(plan?.plan_amount || 0);
  const progress = planAmount > 0 ? Math.min(100, (totalAmount / planAmount) * 100) : 0;
  const missing = Math.max(0, planAmount - totalAmount);

  const visibleDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = deals;
    if (q) {
      list = list.filter(d =>
        (d.client_name || '').toLowerCase().includes(q) ||
        (d.client_phone || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === 'deal_date') { av = new Date(a.deal_date).getTime(); bv = new Date(b.deal_date).getTime(); }
      else if (sortKey === 'total_amount') { av = Number(a.total_amount); bv = Number(b.total_amount); }
      else { av = Math.max(0, Number(a.total_amount) - Number(a.paid_amount)); bv = Math.max(0, Number(b.total_amount) - Number(b.paid_amount)); }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [deals, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(prev =>
      prev.size === visibleDeals.length ? new Set() : new Set(visibleDeals.map(d => d.id))
    );
  }

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteDeal(id);
      toast.success('Сделка удалена');
      onRefresh();
    } catch {
      toast.error('Не удалось удалить сделку');
    }
  }, [onRefresh]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map(id => deleteDeal(id)));
      toast.success(`Удалено сделок: ${ids.length}`);
      setSelectedIds(new Set());
      onRefresh();
    } catch {
      toast.error('Не удалось удалить некоторые сделки');
      onRefresh();
    }
  }, [selectedIds, onRefresh]);

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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium">Сделки</span>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск по имени или телефону"
                    className="h-8 text-sm pl-7 w-56"
                  />
                </div>
                {selectedIds.size > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs text-destructive hover:text-destructive">
                        <Trash2 size={14} className="mr-1" />
                        Удалить выбранные ({selectedIds.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить {selectedIds.size} сделок?</AlertDialogTitle>
                        <AlertDialogDescription>Это действие необратимо.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleBulkDelete}
                        >Удалить</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button size="sm" variant="outline" onClick={() => { setEditDeal(null); setFormOpen(true); }}>
                  <Plus size={14} className="mr-1" />
                  Добавить
                </Button>
              </div>
            </div>

            {deals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Нет сделок за этот месяц</p>
            ) : visibleDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Ничего не найдено по запросу «{search}»</p>
            ) : (
              <div className="w-full overflow-x-auto rounded-md border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selectedIds.size > 0 && selectedIds.size === visibleDeals.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Выбрать все"
                        />
                      </TableHead>
                      <TableHead className="whitespace-nowrap cursor-pointer select-none" onClick={() => toggleSort('deal_date')}>
                        <span className="inline-flex items-center gap-1">Дата <ArrowUpDown size={11} className="text-muted-foreground" /></span>
                      </TableHead>
                      <TableHead className="whitespace-nowrap">ФИО</TableHead>
                      <TableHead className="whitespace-nowrap">Оплата</TableHead>
                      <TableHead className="whitespace-nowrap">Модель</TableHead>
                      <TableHead className="whitespace-nowrap">Статус</TableHead>
                      <TableHead className="whitespace-nowrap">Стадия</TableHead>
                      <TableHead className="whitespace-nowrap text-right cursor-pointer select-none" onClick={() => toggleSort('total_amount')}>
                        <span className="inline-flex items-center gap-1">Сумма <ArrowUpDown size={11} className="text-muted-foreground" /></span>
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-right">Оплачено</TableHead>
                      <TableHead className="whitespace-nowrap text-right cursor-pointer select-none" onClick={() => toggleSort('remainder')}>
                        <span className="inline-flex items-center gap-1">Остаток <ArrowUpDown size={11} className="text-muted-foreground" /></span>
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-right">ЗП база</TableHead>
                      <TableHead className="whitespace-nowrap">Комментарий</TableHead>
                      <TableHead className="whitespace-nowrap w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDeals.map(d => (
                      <TableRow key={d.id} data-state={selectedIds.has(d.id) ? 'selected' : undefined}>
                        <TableCell>
                          <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={() => toggleSelect(d.id)} aria-label="Выбрать сделку" />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(d.deal_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{d.client_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {d.payment_method}
                          {d.vat_gross_amount ? (
                            <span className="block text-xs text-muted-foreground">с НДС: {formatCurrency(d.vat_gross_amount)}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm max-w-[150px] truncate">{d.door_model || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge className={`text-[11px] font-normal ${STATUS_BADGE_VARIANT[d.status] || ''}`} variant="secondary">
                            {DEAL_STATUS_LABELS[d.status] || d.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {INSTALL_STAGE_LABELS[d.stage] || d.stage}
                          <div className="mt-1">
                            <TrelloLookup phone={d.client_phone} contractNumber={d.contract_number} />
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(d.total_amount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(d.paid_amount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right align-top">
                          {formatCurrency(Math.max(0, d.total_amount - d.paid_amount))}
                          <DealPayments deal={d} onChanged={onRefresh} />
                        </TableCell>
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
});
