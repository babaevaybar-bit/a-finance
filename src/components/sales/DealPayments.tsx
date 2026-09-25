import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ChevronDown, Plus } from 'lucide-react';
import { getDealPayments, addDealPayment } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, DealPayment } from '@/types/types';
import { PAYMENT_METHODS } from '@/types/types';

/**
 * История доплат по подтверждённой сделке + кнопка добавить новую оплату.
 * Каждая добавленная оплата уменьшает остаток по сделке и сразу создаёт
 * запись в «Финансы» по указанному каналу (если это реальный банк/нал/
 * перечисление — не «Другое»).
 */
export default function DealPayments({ deal, onChanged }: { deal: Deal; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<DealPayment[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [channel, setChannel] = useState<string>('Kaspi Bank');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const remainder = Math.max(0, deal.total_amount - deal.paid_amount);

  async function loadHistory() {
    setLoading(true);
    try { setPayments(await getDealPayments(deal.id)); }
    catch { toast.error('Не удалось загрузить историю оплат'); }
    finally { setLoading(false); }
  }

  async function handleToggle() {
    if (!open && payments === null) await loadHistory();
    setOpen(!open);
  }

  function openAddDialog() {
    setAmount(remainder > 0 ? remainder : 0);
    setChannel('Kaspi Bank');
    setDate(new Date().toISOString().slice(0, 10));
    setComment('');
    setDialogOpen(true);
  }

  async function handleSave() {
    if (amount <= 0) { toast.error('Сумма должна быть больше 0'); return; }
    setSaving(true);
    try {
      const { incomeRecorded } = await addDealPayment(deal.id, amount, channel, date, comment || undefined);
      toast.success(
        incomeRecorded
          ? `Оплата добавлена, сумма учтена в «Финансы» (${channel})`
          : 'Оплата добавлена — канал не определён, добавьте поступление в «Финансы» вручную'
      );
      setDialogOpen(false);
      setPayments(null);
      await loadHistory();
      onChanged();
    } catch { toast.error('Ошибка при сохранении оплаты'); }
    finally { setSaving(false); }
  }

  if (deal.status !== 'approved') return null;

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-xs text-primary flex items-center gap-1 hover:underline"
          onClick={handleToggle}
        >
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          Оплаты{payments ? ` (${payments.length})` : ''}
        </button>
        {remainder > 0 && (
          <button type="button" className="text-xs text-primary flex items-center gap-1 hover:underline" onClick={openAddDialog}>
            <Plus size={12} />Добавить оплату
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1.5 space-y-1">
          {loading && <p className="text-xs text-muted-foreground">Загрузка...</p>}
          {payments?.length === 0 && <p className="text-xs text-muted-foreground">Пока нет оплат</p>}
          {payments?.map(p => (
            <div key={p.id} className="text-xs flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
              <span>{formatDate(p.payment_date)} · {p.channel}{p.comment ? ` — ${p.comment}` : ''}</span>
              <span className="font-medium shrink-0">{formatCurrency(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Добавить оплату</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Остаток по сделке: {formatCurrency(remainder)}
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Сумма</Label>
              <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Способ оплаты</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Дата</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Комментарий (необязательно)</Label>
              <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Например: доплата за установку" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
