import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CalendarClock, Plus, Trash2, Check, Pencil, X, Split, ChevronDown } from 'lucide-react';
import {
  getPaymentSchedule, addPaymentScheduleItem, updatePaymentScheduleItem,
  deletePaymentScheduleItem, replacePaymentSchedule, computeScheduleStatus,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, PaymentScheduleItem } from '@/types/types';

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * График доплат по сделке: остаток делится на несколько частей, у каждой
 * своя сумма и дата. Даты и суммы можно менять в любой момент. Какие части
 * уже закрыты — видно автоматически по фактически внесённым оплатам.
 */
export default function PaymentSchedule({ deal, refreshKey, defaultOpen = false }: { deal: Deal; refreshKey?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState<PaymentScheduleItem[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState(0);
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newAmount, setNewAmount] = useState(0);
  const [splitMode, setSplitMode] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitStart, setSplitStart] = useState('');
  const [busy, setBusy] = useState(false);

  const remainder = Math.max(0, Number(deal.total_amount) - Number(deal.paid_amount));

  const load = useCallback(async () => {
    try { setItems(await getPaymentSchedule(deal.id)); } catch { setItems([]); }
  }, [deal.id]);

  useEffect(() => { if (open) load(); }, [open, load, refreshKey, deal.paid_amount]);

  if (!open) {
    return (
      <button type="button" className="text-xs text-primary flex items-center gap-1 hover:underline" onClick={() => setOpen(true)}>
        <ChevronDown size={12} /><CalendarClock size={12} />График доплат
      </button>
    );
  }

  if (items === null) return <p className="text-xs text-muted-foreground">Загрузка графика...</p>;

  const status = computeScheduleStatus(items, deal.total_amount, deal.paid_amount);
  const unpaidScheduled = items.reduce((s, i) => s + (Number(i.amount) - (status[i.id]?.paidPart ?? 0)), 0);
  const diff = remainder - unpaidScheduled;
  const today = new Date().toISOString().slice(0, 10);

  async function saveEdit(item: PaymentScheduleItem) {
    if (!editDate || editAmount <= 0) { toast.error('Укажите дату и сумму больше 0'); return; }
    setBusy(true);
    try {
      await updatePaymentScheduleItem(item.id, deal.id, { due_date: editDate, amount: editAmount });
      setEditingId(null);
      await load();
    } catch { toast.error('Не удалось сохранить'); }
    finally { setBusy(false); }
  }

  async function handleDelete(item: PaymentScheduleItem) {
    setBusy(true);
    try { await deletePaymentScheduleItem(item.id, deal.id); await load(); }
    catch { toast.error('Не удалось удалить'); }
    finally { setBusy(false); }
  }

  async function handleAdd() {
    if (!newDate || newAmount <= 0) { toast.error('Укажите дату и сумму больше 0'); return; }
    setBusy(true);
    try {
      await addPaymentScheduleItem(deal.id, newDate, newAmount);
      setAdding(false); setNewDate(''); setNewAmount(0);
      await load();
    } catch { toast.error('Не удалось добавить'); }
    finally { setBusy(false); }
  }

  function openAdd() {
    setNewDate(items && items.length > 0 ? addMonths(items[items.length - 1].due_date, 1) : today);
    setNewAmount(diff > 0 ? diff : 0);
    setAdding(true);
  }

  function openSplit() {
    setSplitStart(today);
    setSplitCount(2);
    setSplitMode(true);
  }

  async function handleSplit() {
    if (splitCount < 1 || !splitStart) return;
    if (remainder <= 0) { toast.error('Остаток уже 0 — делить нечего'); return; }
    setBusy(true);
    try {
      // Делим остаток поровну (округление до тенге, остаток копеек — в последнюю часть),
      // даты — раз в месяц начиная с выбранной. Потом любую часть можно поправить.
      const base = Math.floor(remainder / splitCount);
      const parts = Array.from({ length: splitCount }, (_, i) => ({
        due_date: addMonths(splitStart, i),
        amount: i === splitCount - 1 ? remainder - base * (splitCount - 1) : base,
      }));
      await replacePaymentSchedule(deal.id, parts);
      setSplitMode(false);
      await load();
      toast.success(`Остаток разделён на ${splitCount} част${splitCount === 1 ? 'ь' : splitCount < 5 ? 'и' : 'ей'} — даты и суммы можно поправить`);
    } catch { toast.error('Не удалось разделить'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-2 text-left whitespace-normal min-w-[260px]">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="text-xs font-semibold flex items-center gap-1.5" onClick={() => setOpen(false)}>
          <ChevronDown size={12} className="rotate-180" /><CalendarClock size={13} />График доплат
        </button>
        <div className="flex items-center gap-2">
          {remainder > 0 && (
            <button type="button" className="text-xs text-primary flex items-center gap-1 hover:underline" onClick={openSplit}>
              <Split size={12} />Разделить
            </button>
          )}
          <button type="button" className="text-xs text-primary flex items-center gap-1 hover:underline" onClick={openAdd}>
            <Plus size={12} />Добавить
          </button>
        </div>
      </div>

      {splitMode && (
        <div className="rounded-lg border border-dashed border-border p-2.5 space-y-2">
          <p className="text-xs text-muted-foreground">
            Остаток {formatCurrency(remainder)} разделится поровну, раз в месяц. Старый график заменится.
          </p>
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={24} className="h-8 text-xs w-20" value={splitCount}
              onChange={e => setSplitCount(Math.max(1, Math.min(24, Number(e.target.value))))} />
            <span className="text-xs text-muted-foreground shrink-0">частей, с</span>
            <Input type="date" className="h-8 text-xs" value={splitStart} onChange={e => setSplitStart(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSplitMode(false)}>Отмена</Button>
            <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={handleSplit}>Разделить</Button>
          </div>
        </div>
      )}

      {items.length === 0 && !adding && !splitMode && (
        <p className="text-xs text-muted-foreground">
          {remainder > 0 ? 'Даты доплат не заданы' : 'Сделка оплачена полностью'}
        </p>
      )}

      <div className="space-y-1">
        {items.map((item, idx) => {
          const st = status[item.id];
          const overdue = !st?.isPaid && item.due_date < today;
          const isEditing = editingId === item.id;
          return (
            <div
              key={item.id}
              className={`rounded-md px-2 py-1.5 text-xs flex items-center gap-2 ${
                st?.isPaid ? 'bg-green-50 text-green-800' : overdue ? 'bg-red-50 text-red-800' : 'bg-muted/40'
              }`}
            >
              <span className="w-4 shrink-0 text-muted-foreground">{idx + 1}.</span>
              {isEditing ? (
                <>
                  <Input type="date" className="h-7 text-xs flex-1" value={editDate} onChange={e => setEditDate(e.target.value)} />
                  <Input type="number" className="h-7 text-xs w-28" value={editAmount} onChange={e => setEditAmount(Number(e.target.value))} />
                  <button type="button" disabled={busy} onClick={() => saveEdit(item)} className="text-green-700 hover:text-green-900"><Check size={14} /></button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1">
                    {formatDate(item.due_date)}
                    {st?.isPaid ? ' · оплачено' : overdue ? ' · просрочено' : ''}
                    {!st?.isPaid && (st?.paidPart ?? 0) > 0 ? ` · частично ${formatCurrency(st.paidPart)}` : ''}
                  </span>
                  <span className="font-medium shrink-0">{formatCurrency(item.amount)}</span>
                  <button type="button" className="text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditingId(item.id); setEditDate(item.due_date); setEditAmount(Number(item.amount)); }}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" disabled={busy} className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item)}>
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="flex items-center gap-2">
          <Input type="date" className="h-8 text-xs flex-1" value={newDate} onChange={e => setNewDate(e.target.value)} />
          <Input type="number" className="h-8 text-xs w-28" placeholder="Сумма" value={newAmount || ''} onChange={e => setNewAmount(Number(e.target.value))} />
          <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={handleAdd}>OK</Button>
          <button type="button" onClick={() => setAdding(false)} className="text-muted-foreground"><X size={14} /></button>
        </div>
      )}

      {items.length > 0 && Math.abs(diff) >= 1 && (
        <p className={`text-[11px] ${diff > 0 ? 'text-amber-700' : 'text-destructive'}`}>
          {diff > 0
            ? `Не распределено ${formatCurrency(diff)} из остатка — добавьте ещё доплату или увеличьте суммы`
            : `График превышает остаток на ${formatCurrency(-diff)} — уменьшите суммы`}
        </p>
      )}
    </div>
  );
}
