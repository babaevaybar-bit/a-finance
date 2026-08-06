import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import {
  getExpenses, createExpense, updateExpense, deleteExpense,
  getIncome, createIncome, updateIncome, deleteIncome,
  getManagers,
  getTransfers, createTransfer, updateTransfer, deleteTransfer,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Expense, Income, Manager, Transfer } from '@/types/types';
import { CHANNELS } from '@/types/types';

// ─── helpers ──────────────────────────────────────────────────────────────────
function inRange(dateStr: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

// ─── Balance summary (transfers cancel out per channel) ────────────────────────
const BANK_LOGOS: Record<string, string> = {
  'Kaspi Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Kaspi_bank_logo.svg/200px-Kaspi_bank_logo.svg.png',
  'Halyk Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Halyk_Bank_logo.svg/200px-Halyk_Bank_logo.svg.png',
  'Freedom Bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Freedom_Finance_logo.svg/200px-Freedom_Finance_logo.svg.png',
};

function BankLabel({ channel }: { channel: string }) {
  const logo = BANK_LOGOS[channel];
  if (logo) {
    return (
      <div className="flex items-center gap-1.5">
        <img
          src={logo}
          alt={channel}
          className="h-4 w-auto object-contain"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <span className="text-xs text-muted-foreground">{channel}</span>
      </div>
    );
  }
  return <p className="text-xs text-muted-foreground">{channel}</p>;
}

function BalanceSummary({ expenses, income, transfers }: {
  expenses: Expense[]; income: Income[]; transfers: Transfer[];
}) {
  const channels: string[] = ['Kaspi Bank', 'Halyk Bank', 'Freedom Bank', 'Наличные'];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {channels.map(ch => {
        const inc = income.filter(i => i.channel === ch).reduce((s, i) => s + Number(i.total_amount), 0);
        const exp = expenses.filter(e => e.channel === ch).reduce((s, e) => s + Number(e.amount), 0);
        const trOut = transfers.filter(t => t.from_channel === ch).reduce((s, t) => s + Number(t.amount), 0);
        const trIn  = transfers.filter(t => t.to_channel   === ch).reduce((s, t) => s + Number(t.amount), 0);
        const balance = inc - exp - trOut + trIn;
        return (
          <div key={ch} className="rounded-md border border-border p-3">
            <BankLabel channel={ch} />
            <p className={`text-base font-semibold mt-1 ${balance < 0 ? 'text-destructive' : 'text-foreground'}`}>
              {formatCurrency(balance)}
            </p>
            <div className="text-xs text-muted-foreground mt-1 flex flex-col gap-0.5">
              <span>↑ {formatCurrency(inc)}</span>
              <span>↓ {formatCurrency(exp)}</span>
              {(trOut > 0 || trIn > 0) && (
                <span className="text-muted-foreground/70">⇄ {trIn > 0 ? `+${formatCurrency(trIn)}` : ''}{trOut > 0 ? ` −${formatCurrency(trOut)}` : ''}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Date range filter bar ─────────────────────────────────────────────────────
interface DateRangeProps {
  from: string; to: string;
  onFrom: (v: string) => void; onTo: (v: string) => void;
  onClear: () => void;
}
function DateRangeFilter({ from, to, onFrom, onTo, onClear }: DateRangeProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs">С</Label>
        <Input type="date" className="h-8 text-sm w-36" value={from} onChange={e => onFrom(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">По</Label>
        <Input type="date" className="h-8 text-sm w-36" value={to} onChange={e => onTo(e.target.value)} />
      </div>
      {(from || to) && (
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClear} title="Сбросить фильтр">
          <X size={14} />
        </Button>
      )}
    </div>
  );
}

// ─── Expense form ─────────────────────────────────────────────────────────────
const EMPTY_EXP: Omit<Expense, 'id' | 'created_at' | 'updated_at'> = {
  expense_date: new Date().toISOString().slice(0, 10),
  amount: 0,
  channel: 'Kaspi Bank',
  description: '',
};

function ExpenseFormDialog({ open, onClose, onSaved, expense }: {
  open: boolean; onClose: () => void; onSaved: () => void; expense?: Expense | null;
}) {
  const [form, setForm] = useState(EMPTY_EXP);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (expense) setForm({ expense_date: expense.expense_date, amount: expense.amount, channel: expense.channel, description: expense.description });
    else setForm(EMPTY_EXP);
  }, [expense, open]);

  async function save() {
    if (!form.description.trim()) { toast.error('Введите описание'); return; }
    if (Number(form.amount) <= 0) { toast.error('Сумма должна быть больше 0'); return; }
    setSaving(true);
    try {
      if (expense) { await updateExpense(expense.id, form); toast.success('Расход обновлён'); }
      else { await createExpense(form); toast.success('Расход добавлен'); }
      onSaved(); onClose();
    } catch { toast.error('Ошибка'); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <DialogHeader><DialogTitle>{expense ? 'Редактировать расход' : 'Новый расход'}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Дата *</Label>
              <Input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Канал *</Label>
              <Select value={form.channel} onValueChange={v => set('channel', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Сумма (₸) *</Label>
            <Input type="number" min="0" value={form.amount || ''} onChange={e => set('amount', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Описание *</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Назначение расхода" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Income form ──────────────────────────────────────────────────────────────
const EMPTY_INC: Omit<Income, 'id' | 'created_at' | 'updated_at'> = {
  manager_id: null,
  income_date: new Date().toISOString().slice(0, 10),
  from_whom: '',
  total_amount: 0,
  quantity: null,
  channel: 'Kaspi Bank',
  comment: null,
};

function IncomeFormDialog({ open, onClose, onSaved, income, managers }: {
  open: boolean; onClose: () => void; onSaved: () => void; income?: Income | null; managers: Manager[];
}) {
  const [form, setForm] = useState<typeof EMPTY_INC>(EMPTY_INC);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string | number | null) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (income) setForm({ manager_id: income.manager_id, income_date: income.income_date, from_whom: income.from_whom, total_amount: income.total_amount, quantity: income.quantity, channel: income.channel, comment: income.comment });
    else setForm(EMPTY_INC);
  }, [income, open]);

  async function save() {
    if (!form.from_whom.trim()) { toast.error('Укажите от кого'); return; }
    if (Number(form.total_amount) <= 0) { toast.error('Сумма должна быть больше 0'); return; }
    setSaving(true);
    try {
      const payload = { ...form, from_whom: form.from_whom.trim(), comment: form.comment || null, manager_id: form.manager_id || null };
      if (income) { await updateIncome(income.id, payload); toast.success('Поступление обновлено'); }
      else { await createIncome(payload); toast.success('Поступление добавлено'); }
      onSaved(); onClose();
    } catch { toast.error('Ошибка'); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <DialogHeader><DialogTitle>{income ? 'Редактировать поступление' : 'Новое поступление'}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Дата *</Label>
              <Input type="date" value={form.income_date} onChange={e => set('income_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Канал *</Label>
              <Select value={form.channel} onValueChange={v => set('channel', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>От кого *</Label>
            <Input value={form.from_whom} onChange={e => set('from_whom', e.target.value)} placeholder="Имя / компания" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Сумма (₸) *</Label>
              <Input type="number" min="0" value={form.total_amount || ''} onChange={e => set('total_amount', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Кол-во</Label>
              <Input type="number" min="0" value={form.quantity || ''} onChange={e => set('quantity', e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Менеджер</Label>
            <Select value={form.manager_id || 'none'} onValueChange={v => set('manager_id', v === 'none' ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Не указан" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не указан</SelectItem>
                {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Комментарий</Label>
            <Input value={form.comment || ''} onChange={e => set('comment', e.target.value || null)} placeholder="Необязательно" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transfer form ────────────────────────────────────────────────────────────
const EMPTY_TR: Omit<Transfer, 'id' | 'created_at' | 'updated_at'> = {
  transfer_date: new Date().toISOString().slice(0, 10),
  from_channel: 'Kaspi Bank',
  to_channel: 'Halyk Bank',
  amount: 0,
  comment: null,
};

function TransferFormDialog({ open, onClose, onSaved, transfer }: {
  open: boolean; onClose: () => void; onSaved: () => void; transfer?: Transfer | null;
}) {
  const [form, setForm] = useState(EMPTY_TR);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | number | null) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (transfer) setForm({ transfer_date: transfer.transfer_date, from_channel: transfer.from_channel, to_channel: transfer.to_channel, amount: transfer.amount, comment: transfer.comment });
    else setForm(EMPTY_TR);
  }, [transfer, open]);

  async function save() {
    if (Number(form.amount) <= 0) { toast.error('Сумма должна быть больше 0'); return; }
    if (form.from_channel === form.to_channel) { toast.error('Счета не могут совпадать'); return; }
    setSaving(true);
    try {
      if (transfer) { await updateTransfer(transfer.id, form); toast.success('Перевод обновлён'); }
      else { await createTransfer(form); toast.success('Перевод записан'); }
      onSaved(); onClose();
    } catch { toast.error('Ошибка'); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <DialogHeader><DialogTitle>{transfer ? 'Редактировать перевод' : 'Перевод между счетами'}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1 px-0">Переводы не влияют на прибыль и расходы</p>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Дата *</Label>
            <Input type="date" value={form.transfer_date} onChange={e => set('transfer_date', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Откуда *</Label>
              <Select value={form.from_channel} onValueChange={v => set('from_channel', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Куда *</Label>
              <Select value={form.to_channel} onValueChange={v => set('to_channel', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Сумма (₸) *</Label>
            <Input type="number" min="0" value={form.amount || ''} onChange={e => set('amount', Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Комментарий</Label>
            <Input value={form.comment || ''} onChange={e => set('comment', e.target.value || null)} placeholder="Необязательно" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reusable row actions ─────────────────────────────────────────────────────
function RowActions({ onEdit, onDelete, deleteTitle }: { onEdit: () => void; onDelete: () => void; deleteTitle: string }) {
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil size={12} /></Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 size={12} /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader><AlertDialogTitle>{deleteTitle}</AlertDialogTitle><AlertDialogDescription>Действие необратимо.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FinancePage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);

  // form dialogs
  const [expFormOpen, setExpFormOpen] = useState(false);
  const [incFormOpen, setIncFormOpen] = useState(false);
  const [trFormOpen, setTrFormOpen] = useState(false);
  const [editExp, setEditExp] = useState<Expense | null>(null);
  const [editInc, setEditInc] = useState<Income | null>(null);
  const [editTr, setEditTr] = useState<Transfer | null>(null);

  // date filters (shared for expenses & income; separate for transfers)
  const [expFrom, setExpFrom] = useState('');
  const [expTo, setExpTo] = useState('');
  const [incFrom, setIncFrom] = useState('');
  const [incTo, setIncTo] = useState('');
  const [trFrom, setTrFrom] = useState('');
  const [trTo, setTrTo] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [exps, incs, mgrs, trs] = await Promise.all([
        getExpenses(), getIncome(), getManagers(), getTransfers(),
      ]);
      setExpenses(exps); setIncome(incs); setManagers(mgrs); setTransfers(trs);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getManagerName = (id: string | null) => managers.find(m => m.id === id)?.name || '—';

  // filtered views
  const filteredExp = expenses.filter(e => inRange(e.expense_date, expFrom, expTo));
  const filteredInc = income.filter(i => inRange(i.income_date, incFrom, incTo));
  const filteredTr = transfers.filter(t => inRange(t.transfer_date, trFrom, trTo));

  // totals (always full dataset — not affected by date filter)
  const totalIncome = income.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  async function handleDeleteExp(id: string) {
    try { await deleteExpense(id); toast.success('Удалено'); await loadData(); }
    catch { toast.error('Ошибка'); }
  }
  async function handleDeleteInc(id: string) {
    try { await deleteIncome(id); toast.success('Удалено'); await loadData(); }
    catch { toast.error('Ошибка'); }
  }
  async function handleDeleteTr(id: string) {
    try { await deleteTransfer(id); toast.success('Удалено'); await loadData(); }
    catch { toast.error('Ошибка'); }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Финансы и балансы</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Учёт расходов, поступлений и переводов между счетами</p>
        </div>

        {/* Overall summary (excludes transfers) */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Всего поступлений</p>
            <p className="text-base font-semibold mt-1">{formatCurrency(totalIncome)}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Всего расходов</p>
            <p className="text-base font-semibold mt-1 text-destructive">{formatCurrency(totalExpenses)}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Итого баланс</p>
            <p className={`text-base font-semibold mt-1 ${totalIncome - totalExpenses < 0 ? 'text-destructive' : 'text-foreground'}`}>
              {formatCurrency(totalIncome - totalExpenses)}
            </p>
          </div>
        </div>

        {/* Balance by channel (full data, no date filter) */}
        {!loading && <BalanceSummary expenses={expenses} income={income} transfers={transfers} />}

        {/* Tabs */}
        <Tabs defaultValue="expenses">
          <TabsList>
            <TabsTrigger value="expenses">Расходы ({expenses.length})</TabsTrigger>
            <TabsTrigger value="income">Поступления ({income.length})</TabsTrigger>
            <TabsTrigger value="transfers">Переводы ({transfers.length})</TabsTrigger>
          </TabsList>

          {/* ── Expenses ── */}
          <TabsContent value="expenses" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <CardTitle className="text-base shrink-0">Расходы</CardTitle>
                  <div className="flex flex-wrap items-end gap-2">
                    <DateRangeFilter from={expFrom} to={expTo} onFrom={setExpFrom} onTo={setExpTo} onClear={() => { setExpFrom(''); setExpTo(''); }} />
                    <Button size="sm" variant="outline" onClick={() => { setEditExp(null); setExpFormOpen(true); }}>
                      <Plus size={14} className="mr-1" />Добавить
                    </Button>
                  </div>
                </div>
                {(expFrom || expTo) && (
                  <p className="text-xs text-muted-foreground">
                    Показано: {filteredExp.length} из {expenses.length} · итого {formatCurrency(filteredExp.reduce((s, e) => s + Number(e.amount), 0))}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {loading ? <div className="h-24 bg-muted rounded animate-pulse" /> : (
                  filteredExp.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Нет расходов</p>
                  ) : (
                    <div className="w-full overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="whitespace-nowrap">Дата</TableHead>
                            <TableHead className="whitespace-nowrap">Описание</TableHead>
                            <TableHead className="whitespace-nowrap">Канал</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Сумма</TableHead>
                            <TableHead className="whitespace-nowrap w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredExp.map(e => (
                            <TableRow key={e.id}>
                              <TableCell className="whitespace-nowrap text-sm">{formatDate(e.expense_date)}</TableCell>
                              <TableCell className="text-sm">{e.description}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{e.channel}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm text-right text-destructive">{formatCurrency(e.amount)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <RowActions onEdit={() => { setEditExp(e); setExpFormOpen(true); }} onDelete={() => handleDeleteExp(e.id)} deleteTitle="Удалить расход?" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Income ── */}
          <TabsContent value="income" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <CardTitle className="text-base shrink-0">Поступления</CardTitle>
                  <div className="flex flex-wrap items-end gap-2">
                    <DateRangeFilter from={incFrom} to={incTo} onFrom={setIncFrom} onTo={setIncTo} onClear={() => { setIncFrom(''); setIncTo(''); }} />
                    <Button size="sm" variant="outline" onClick={() => { setEditInc(null); setIncFormOpen(true); }}>
                      <Plus size={14} className="mr-1" />Добавить
                    </Button>
                  </div>
                </div>
                {(incFrom || incTo) && (
                  <p className="text-xs text-muted-foreground">
                    Показано: {filteredInc.length} из {income.length} · итого {formatCurrency(filteredInc.reduce((s, i) => s + Number(i.total_amount), 0))}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {loading ? <div className="h-24 bg-muted rounded animate-pulse" /> : (
                  filteredInc.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Нет поступлений</p>
                  ) : (
                    <div className="w-full overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="whitespace-nowrap">Дата</TableHead>
                            <TableHead className="whitespace-nowrap">От кого</TableHead>
                            <TableHead className="whitespace-nowrap">Менеджер</TableHead>
                            <TableHead className="whitespace-nowrap">Канал</TableHead>
                            <TableHead className="whitespace-nowrap">Кол-во</TableHead>
                            <TableHead className="whitespace-nowrap">Комментарий</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Сумма</TableHead>
                            <TableHead className="whitespace-nowrap w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredInc.map(i => (
                            <TableRow key={i.id}>
                              <TableCell className="whitespace-nowrap text-sm">{formatDate(i.income_date)}</TableCell>
                              <TableCell className="text-sm">{i.from_whom}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{getManagerName(i.manager_id)}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{i.channel}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{i.quantity ?? '—'}</TableCell>
                              <TableCell className="text-sm max-w-[150px] truncate">{i.comment || '—'}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(i.total_amount)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <RowActions onEdit={() => { setEditInc(i); setIncFormOpen(true); }} onDelete={() => handleDeleteInc(i.id)} deleteTitle="Удалить поступление?" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Transfers ── */}
          <TabsContent value="transfers" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="shrink-0">
                    <CardTitle className="text-base">Переводы между счетами</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Не учитываются в расходах и прибыли</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <DateRangeFilter from={trFrom} to={trTo} onFrom={setTrFrom} onTo={setTrTo} onClear={() => { setTrFrom(''); setTrTo(''); }} />
                    <Button size="sm" variant="outline" onClick={() => { setEditTr(null); setTrFormOpen(true); }}>
                      <Plus size={14} className="mr-1" />Добавить
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? <div className="h-24 bg-muted rounded animate-pulse" /> : (
                  filteredTr.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Нет переводов</p>
                  ) : (
                    <div className="w-full overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="whitespace-nowrap">Дата</TableHead>
                            <TableHead className="whitespace-nowrap">Откуда</TableHead>
                            <TableHead className="whitespace-nowrap">Куда</TableHead>
                            <TableHead className="whitespace-nowrap text-right">Сумма</TableHead>
                            <TableHead className="whitespace-nowrap">Комментарий</TableHead>
                            <TableHead className="whitespace-nowrap w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTr.map(t => (
                            <TableRow key={t.id}>
                              <TableCell className="whitespace-nowrap text-sm">{formatDate(t.transfer_date)}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{t.from_channel}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{t.to_channel}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm text-right tabular-nums">{formatCurrency(t.amount)}</TableCell>
                              <TableCell className="text-sm max-w-[180px] truncate">{t.comment || '—'}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <RowActions onEdit={() => { setEditTr(t); setTrFormOpen(true); }} onDelete={() => handleDeleteTr(t.id)} deleteTitle="Удалить перевод?" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ExpenseFormDialog open={expFormOpen} onClose={() => setExpFormOpen(false)} onSaved={loadData} expense={editExp} />
      <IncomeFormDialog open={incFormOpen} onClose={() => setIncFormOpen(false)} onSaved={loadData} income={editInc} managers={managers} />
      <TransferFormDialog open={trFormOpen} onClose={() => setTrFormOpen(false)} onSaved={loadData} transfer={editTr} />
    </AppLayout>
  );
}
