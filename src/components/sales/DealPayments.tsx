import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Wallet, Plus, CalendarClock, History, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getDealPayments, addDealPayment, assignPaymentChannel } from '@/lib/api';
import PaymentSchedule from './PaymentSchedule';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, DealPayment } from '@/types/types';
import { PAYMENT_METHODS, CHANNELS } from '@/types/types';

/**
 * Оплаты по сделке — одно понятное место.
 * В строке/карточке: полоска «оплачено из суммы», остаток, ближайшая
 * доплата и ОДНА кнопка «Оплаты». Всё управление — в окне:
 * 1) сводка, 2) «Внести оплату», 3) план будущих доплат, 4) история.
 */
export default function DealPayments({ deal, onChanged, suggestedAmount, suggestedChannel }: {
  deal: Deal; onChanged: () => void; suggestedAmount?: number; suggestedChannel?: string; scheduleOpen?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const total = Number(deal.total_amount);
  const paid = Number(deal.paid_amount);
  const remainder = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const nextOverdue = !!deal.next_payment_date && deal.next_payment_date < today && remainder > 0;

  return (
    <div className="mt-1.5 space-y-1.5 text-left whitespace-normal min-w-[190px]">
      {/* Полоска прогресса оплаты */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${remainder === 0 ? 'bg-green-600' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        {remainder === 0 ? (
          <span className="text-green-700 flex items-center gap-1"><CheckCircle2 size={11} />Оплачено полностью</span>
        ) : (
          <span className="text-muted-foreground">Оплачено {pct}%</span>
        )}
        {remainder > 0 && deal.next_payment_date && (
          <span className={nextOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
            {nextOverdue ? 'просрочено ' : 'след. '}{formatDate(deal.next_payment_date)}
          </span>
        )}
      </div>
      <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={() => setDialogOpen(true)}>
        <Wallet size={13} className="mr-1.5" />Оплаты
      </Button>

      <PaymentsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        deal={deal}
        onChanged={onChanged}
        suggestedAmount={suggestedAmount}
        suggestedChannel={suggestedChannel}
      />
    </div>
  );
}

function PaymentsDialog({ open, onClose, deal, onChanged, suggestedAmount, suggestedChannel }: {
  open: boolean; onClose: () => void; deal: Deal; onChanged: () => void;
  suggestedAmount?: number; suggestedChannel?: string;
}) {
  const [payments, setPayments] = useState<DealPayment[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [channel, setChannel] = useState<string>('Kaspi Bank');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [scheduleKey, setScheduleKey] = useState(0);

  const total = Number(deal.total_amount);
  const paid = Number(deal.paid_amount);
  const remainder = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const isApproved = deal.status === 'approved';

  useEffect(() => {
    if (!open) return;
    setFormOpen(false);
    getDealPayments(deal.id).then(setPayments).catch(() => setPayments([]));
  }, [open, deal.id, deal.paid_amount]);

  function openForm() {
    setAmount(suggestedAmount ?? remainder);
    setChannel(suggestedChannel ?? 'Kaspi Bank');
    setDate(new Date().toISOString().slice(0, 10));
    setComment('');
    setFormOpen(true);
  }

  async function handleSave() {
    if (amount <= 0) { toast.error('Введите сумму больше 0'); return; }
    if (amount > remainder) { toast.error(`Сумма больше остатка (${formatCurrency(remainder)})`); return; }
    setSaving(true);
    try {
      const { incomeRecorded } = await addDealPayment(deal.id, amount, channel, date, comment || undefined);
      toast.success(incomeRecorded
        ? `Оплата ${formatCurrency(amount)} внесена и учтена в «Финансах» (${channel})`
        : 'Оплата внесена. Способ «Другое» — добавьте поступление в «Финансы» вручную');
      setFormOpen(false);
      setScheduleKey(k => k + 1);
      onChanged();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Ошибка при сохранении'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)] [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-base">Оплаты — {deal.client_name || 'клиент'}</DialogTitle>
        </DialogHeader>

        {/* 1. Сводка */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-[11px] text-muted-foreground">Сумма сделки</p>
            <p className="text-sm font-semibold mt-0.5">{formatCurrency(total)}</p>
          </div>
          <div className="rounded-xl bg-green-50 p-3">
            <p className="text-[11px] text-green-800">Оплачено</p>
            <p className="text-sm font-semibold mt-0.5 text-green-800">{formatCurrency(paid)}</p>
          </div>
          <div className={`rounded-xl p-3 ${remainder > 0 ? 'bg-amber-50' : 'bg-muted/50'}`}>
            <p className={`text-[11px] ${remainder > 0 ? 'text-amber-800' : 'text-muted-foreground'}`}>Остаток</p>
            <p className={`text-sm font-semibold mt-0.5 ${remainder > 0 ? 'text-amber-800' : ''}`}>{formatCurrency(remainder)}</p>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${remainder === 0 ? 'bg-green-600' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>

        {/* 2. Внести оплату */}
        {!isApproved ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            Сделка ещё не подтверждена — внести оплату можно после подтверждения в «Подтверждениях». План доплат ниже можно заполнить уже сейчас.
          </div>
        ) : remainder === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 flex gap-2">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />Сделка оплачена полностью.
          </div>
        ) : !formOpen ? (
          <Button className="w-full" onClick={openForm}>
            <Plus size={15} className="mr-1.5" />Внести оплату
          </Button>
        ) : (
          <div className="rounded-xl border border-border p-3 space-y-3">
            <p className="text-sm font-semibold">Новая оплата</p>
            {suggestedAmount ? (
              <p className="text-[11px] text-amber-700">Сумма подставлена из комментария Trello — проверьте.</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Сумма, ₸</Label>
                <Input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} autoFocus />
                <div className="flex gap-1.5 flex-wrap">
                  <button type="button" className="text-[11px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/70" onClick={() => setAmount(remainder)}>
                    Весь остаток
                  </button>
                  <button type="button" className="text-[11px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/70" onClick={() => setAmount(Math.round(remainder / 2))}>
                    Половина
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Способ оплаты</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Дата</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Комментарий (необязательно)</Label>
                <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Например: вторая доплата" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>Отмена</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить оплату'}</Button>
            </div>
          </div>
        )}

        {/* 3. План доплат */}
        <section className="space-y-2 pt-1">
          <p className="text-sm font-semibold flex items-center gap-1.5"><CalendarClock size={15} />План доплат</p>
          <p className="text-[11px] text-muted-foreground">
            Когда и сколько клиент должен доплатить. Менеджеру придёт напоминание накануне и в день доплаты.
            Внесённые оплаты закрывают строки плана автоматически.
          </p>
          <PaymentSchedule deal={deal} defaultOpen embedded refreshKey={scheduleKey} />
        </section>

        {/* 4. История */}
        <section className="space-y-2 pt-1">
          <p className="text-sm font-semibold flex items-center gap-1.5"><History size={15} />История оплат</p>
          {payments === null ? (
            <p className="text-xs text-muted-foreground">Загрузка...</p>
          ) : payments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Оплат пока не было</p>
          ) : (
            <div className="space-y-1">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p>{formatDate(p.payment_date)} · {p.channel}</p>
                    {p.comment && <p className="text-muted-foreground break-words">{p.comment}</p>}
                    {!(CHANNELS as readonly string[]).includes(p.channel) && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-amber-700">Не в «Финансах» — укажите кассу:</span>
                        <Select onValueChange={async v => {
                          try {
                            await assignPaymentChannel(p.id, v);
                            toast.success(`Оплата ${formatCurrency(p.amount)} внесена в «Финансы» (${v})`);
                            setPayments(prev => prev?.map(x => x.id === p.id ? { ...x, channel: v } : x) ?? prev);
                            onChanged();
                          } catch (err) { toast.error(err instanceof Error ? err.message : 'Ошибка'); }
                        }}>
                          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Выбрать" /></SelectTrigger>
                          <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <span className="font-semibold shrink-0">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
