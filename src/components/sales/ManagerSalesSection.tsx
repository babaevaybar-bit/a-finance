import React, { useState, useCallback, useMemo, useEffect } from 'react';
import DealCompleteness from './DealCompleteness';
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
  /** Всегда развёрнуто (режим «выбран один менеджер» на странице продаж) */
  forceOpen?: boolean;
  /** Сводный режим «Все»: показываем имя менеджера в строке, без плана и без кнопки «Добавить» */
  managerNames?: Record<string, string>;
}

type SortKey = 'deal_date' | 'total_amount' | 'remainder';

const STATUS_BADGE_VARIANT: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

export default React.memo(function ManagerSalesSection({ manager, monthYear, deals, plan, onPlanChange, onRefresh, forceOpen, managerNames }: Props) {
  const collapseKey = `sales_collapsed_${manager.id}`;
  const [collapsedState, setCollapsed] = useState(() => {
    try { return localStorage.getItem(collapseKey) === '1'; } catch { return false; }
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<'all' | 'debt' | 'overdue' | 'pending'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('deal_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (forceOpen) return;
    try { localStorage.setItem(collapseKey, collapsedState ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsedState, collapseKey, forceOpen]);
  const collapsed = forceOpen ? false : collapsedState;
  const isCombined = !!managerNames;

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
        (d.client_phone || '').toLowerCase().includes(q) ||
        (d.contract_number || '').toLowerCase().includes(q)
      );
    }
    // Быстрые фильтры
    const today = new Date().toISOString().slice(0, 10);
    if (quick === 'debt') list = list.filter(d => Number(d.total_amount) > Number(d.paid_amount));
    if (quick === 'overdue') list = list.filter(d => Number(d.total_amount) > Number(d.paid_amount) && !!d.next_payment_date && d.next_payment_date < today);
    if (quick === 'pending') list = list.filter(d => d.status === 'pending');
    const sorted = [...list].sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === 'deal_date') { av = new Date(a.deal_date).getTime(); bv = new Date(b.deal_date).getTime(); }
      else if (sortKey === 'total_amount') { av = Number(a.total_amount); bv = Number(b.total_amount); }
      else { av = Math.max(0, Number(a.total_amount) - Number(a.paid_amount)); bv = Math.max(0, Number(b.total_amount) - Number(b.paid_amount)); }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [deals, search, quick, sortKey, sortDir]);

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
      <CardHeader className={`pb-3 select-none ${forceOpen ? '' : 'cursor-pointer'}`} onClick={() => { if (!forceOpen) setCollapsed(c => !c); }}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 flex-1 min-w-0">
            <span className="truncate">{manager.name}</span>
            <span className="text-xs font-normal text-muted-foreground shrink-0">
              {deals.length} сделок
            </span>
            {!forceOpen && (collapsed ? <ChevronRight size={16} className="shrink-0 text-muted-foreground" /> : <ChevronDown size={16} className="shrink-0 text-muted-foreground" />)}
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
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {([['all', 'Все'], ['debt', 'С долгом'], ['overdue', 'Просрочено'], ['pending', 'На проверке']] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setQuick(k)}
                      className={`h-8 px-2.5 rounded-full text-xs border transition-colors ${quick === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
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
                {!isCombined && (
                <Button size="sm" variant="outline" onClick={() => { setEditDeal(null); setFormOpen(true); }}>
                  <Plus size={14} className="mr-1" />
                  Добавить
                </Button>
                )}
              </div>
            </div>

            {deals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Нет сделок за этот месяц</p>
            ) : visibleDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Ничего не найдено по запросу «{search}»</p>
            ) : (
              <>
              {/* Телефон: сделки карточками одна под другой */}
              <div className="md:hidden space-y-2">
                {visibleDeals.map(d => {
                  const rest = Math.max(0, d.total_amount - d.paid_amount);
                  return (
                    <div key={d.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" className="min-w-0 text-left" onClick={() => { setEditDeal(d); setFormOpen(true); }}>
                          <div className="flex items-center gap-1.5">
                            <DealCompleteness deal={d} />
                            <span className="font-medium truncate">{d.client_name || '—'}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {managerNames ? `${managerNames[d.manager_id] ?? '—'} · ` : ''}{formatDate(d.deal_date)}{d.contract_number ? ` · №${d.contract_number}` : d.has_contract === false ? ' · без договора' : ''} · {d.payment_method}
                          </div>
                        </button>
                        <Badge className={`text-[11px] font-normal shrink-0 ${STATUS_BADGE_VARIANT[d.status] || ''}`} variant="secondary">
                          {DEAL_STATUS_LABELS[d.status] || d.status}
                        </Badge>
                      </div>
                      {d.door_model && <div className="text-xs truncate">{d.door_model}</div>}
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-semibold tabular-nums">{formatCurrency(d.total_amount)}</span>
                        {rest > 0 && <span className="text-xs text-muted-foreground tabular-nums">остаток {formatCurrency(rest)}</span>}
                      </div>
                      <DealPayments deal={d} onChanged={onRefresh} />
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block w-full overflow-x-auto rounded-md border border-border bg-card">
                <Table className="table-fixed min-w-[760px]">
                  <colgroup>
                    <col className="w-9" />
                    <col />
                    <col className="w-[17%]" />
                    <col className="w-[17%]" />
                    <col className="w-[230px]" />
                    <col className="w-[72px]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Checkbox
                          checked={selectedIds.size > 0 && selectedIds.size === visibleDeals.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Выбрать все"
                        />
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('deal_date')}>
                        <span className="inline-flex items-center gap-1">Клиент · дата <ArrowUpDown size={11} className="text-muted-foreground" /></span>
                      </TableHead>
                      <TableHead>Оплата</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>
                        <span className="inline-flex items-center gap-2">
                          <span className="cursor-pointer select-none inline-flex items-center gap-1" onClick={() => toggleSort('total_amount')}>Сумма <ArrowUpDown size={11} className="text-muted-foreground" /></span>
                          <span className="text-muted-foreground/60">·</span>
                          <span className="cursor-pointer select-none inline-flex items-center gap-1" onClick={() => toggleSort('remainder')}>Остаток <ArrowUpDown size={11} className="text-muted-foreground" /></span>
                        </span>
                      </TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDeals.map(d => (
                      <TableRow
                        key={d.id}
                        data-state={selectedIds.has(d.id) ? 'selected' : undefined}
                        className="cursor-pointer select-none"
                        title="Двойной клик — открыть продажу"
                        onDoubleClick={e => {
                          // Не открываем, если двойной клик пришёлся на кнопку, чекбокс, ссылку или поле ввода внутри строки
                          const target = e.target as HTMLElement;
                          if (target.closest('button, a, input, [role="checkbox"], [role="dialog"]')) return;
                          setEditDeal(d); setFormOpen(true);
                        }}
                      >
                        <TableCell className="align-top">
                          <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={() => toggleSelect(d.id)} aria-label="Выбрать сделку" />
                        </TableCell>
                        <TableCell className="text-sm align-top">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <DealCompleteness deal={d} />
                            <span className="font-medium truncate" title={d.client_name || undefined}>{d.client_name || '—'}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {managerNames && <span className="font-medium text-foreground/80">{managerNames[d.manager_id] ?? '—'} · </span>}
                            {formatDate(d.deal_date)}{d.contract_number ? ` · Договор №${d.contract_number}` : d.has_contract === false ? ' · без договора' : ''}
                          </div>
                          {d.door_model && <div className="text-xs truncate mt-0.5" title={d.door_model}>{d.door_model}</div>}
                          {d.comment && <div className="text-[11px] italic text-muted-foreground truncate mt-0.5" title={d.comment}>{d.comment}</div>}
                        </TableCell>
                        <TableCell className="text-sm align-top">
                          <div className="truncate" title={d.payment_method}>{d.payment_method}</div>
                          {d.vat_gross_amount ? (
                            <span className="block text-[11px] text-muted-foreground">с НДС: {formatCurrency(d.vat_gross_amount)}</span>
                          ) : null}
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            ЗП база: {d.salary_amount !== null && d.salary_amount !== undefined ? formatCurrency(d.salary_amount) : <span className="italic">авто</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm align-top">
                          <Badge className={`text-[11px] font-normal ${STATUS_BADGE_VARIANT[d.status] || ''}`} variant="secondary">
                            {DEAL_STATUS_LABELS[d.status] || d.status}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">{INSTALL_STAGE_LABELS[d.stage] || d.stage}</div>
                          <div className="mt-0.5">
                            <TrelloLookup phone={d.client_phone} contractNumber={d.contract_number} />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm align-top">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold tabular-nums whitespace-nowrap">{formatCurrency(d.total_amount)}</span>
                            {d.total_amount - d.paid_amount > 0 && (
                              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">ост. {formatCurrency(Math.max(0, d.total_amount - d.paid_amount))}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">оплачено {formatCurrency(d.paid_amount)}</div>
                          <DealPayments deal={d} onChanged={onRefresh} />
                        </TableCell>
                        <TableCell className="align-top">
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
              </>
            )}
          </div>
        </CardContent>
      )}

      <DealFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={onRefresh}
        managerId={editDeal?.manager_id ?? manager.id}
        monthYear={monthYear}
        deal={editDeal}
      />
    </Card>
  );
});
