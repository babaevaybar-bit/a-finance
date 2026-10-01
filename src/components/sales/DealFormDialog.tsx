import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { createDeal, updateDeal } from '@/lib/api';
import type { Deal } from '@/types/types';
import { PAYMENT_METHODS, DEAL_STAGES, INSTALL_STAGE_LABELS, CHANNELS, SPLIT_PAYMENT_METHOD } from '@/types/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  managerId: string;
  monthYear: string;
  deal?: Deal | null;
}

// Дата по умолчанию: сегодня, если сегодня входит в выбранный месяц,
// иначе — 1-е число выбранного месяца (чтобы сделка визуально совпадала с табом).
function defaultDealDate(monthYear: string): string {
  const today = new Date();
  const todayMonthYear = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (todayMonthYear === monthYear) return today.toISOString().slice(0, 10);
  return `${monthYear}-01`;
}

function emptyDeal(monthYear: string): Omit<Deal, 'id' | 'created_at' | 'updated_at'> {
  return {
    manager_id: '',
    month_year: '',
    deal_date: defaultDealDate(monthYear),
    client_phone: '',
    address: '',
    client_name: '',
    payment_method: 'Kaspi Bank',
    door_model: '',
    total_amount: 0,
    paid_amount: 0,
    prepayment_date: null,
    next_payment_date: null,
        payment_split: null,
    comment: null,
    salary_amount: null,
    vat_gross_amount: null,
    contract_number: null,
    status: 'pending',
    stage: 'new',
  };
}

export default function DealFormDialog({ open, onClose, onSaved, managerId, monthYear, deal }: Props) {
  const [form, setForm] = useState(emptyDeal(monthYear));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deal) {
      setForm({
        manager_id: deal.manager_id,
        month_year: deal.month_year,
        deal_date: deal.deal_date,
        client_phone: deal.client_phone || '',
        address: deal.address || '',
        client_name: deal.client_name || '',
        payment_method: deal.payment_method,
        door_model: deal.door_model || '',
        total_amount: deal.total_amount,
        paid_amount: deal.paid_amount,
        prepayment_date: deal.prepayment_date || null,
        next_payment_date: deal.next_payment_date || null,
        payment_split: deal.payment_split ?? null,
        comment: deal.comment || null,
        salary_amount: deal.salary_amount ?? null,
        vat_gross_amount: deal.vat_gross_amount ?? null,
        contract_number: deal.contract_number ?? null,
        status: deal.status ?? 'pending',
        stage: deal.stage ?? 'new',
      });
    } else {
      setForm({ ...emptyDeal(monthYear), manager_id: managerId, month_year: monthYear });
    }
  }, [deal, managerId, monthYear, open]);

  const set = (key: keyof typeof form, val: string | number | null) =>
    setForm(f => ({ ...f, [key]: val }));

  async function handleSave() {
    if (!form.deal_date) { toast.error('Укажите дату сделки'); return; }
    if (form.payment_method === 'Перечисление' && !(Number(form.vat_gross_amount) > 0)) {
      toast.error('Укажите сумму с НДС'); return;
    }
    if (form.total_amount <= 0) { toast.error('Общая сумма должна быть больше 0'); return; }
    if (form.paid_amount > form.total_amount) { toast.error('Оплачено не может превышать общую сумму'); return; }
    const split = form.payment_method === SPLIT_PAYMENT_METHOD ? (form.payment_split ?? []).filter(r => Number(r.amount) > 0) : null;
    if (split && Number(form.paid_amount) > 0) {
      const splitSum = split.reduce((s, r) => s + Number(r.amount), 0);
      if (split.length < 2) { toast.error('Для «Несколько способов» укажите минимум две части оплаты'); return; }
      if (Math.round(splitSum) !== Math.round(Number(form.paid_amount))) {
        toast.error(`Сумма частей (${splitSum.toLocaleString('ru-RU')} ₸) должна равняться «Оплачено» (${Number(form.paid_amount).toLocaleString('ru-RU')} ₸)`); return;
      }
    }
    if (form.salary_amount !== null && Number(form.salary_amount) < 0) { toast.error('Сумма для ЗП не может быть отрицательной'); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        payment_split: form.payment_method === SPLIT_PAYMENT_METHOD ? (form.payment_split ?? []).filter(r => Number(r.amount) > 0) : null,
        manager_id: managerId,
        month_year: monthYear,
        vat_gross_amount: form.payment_method === 'Перечисление' && form.vat_gross_amount
          ? Number(form.vat_gross_amount)
          : null,
        client_phone: form.client_phone || null,
        address: form.address || null,
        client_name: form.client_name || null,
        door_model: form.door_model || null,
        prepayment_date: form.prepayment_date || null,
        next_payment_date: form.next_payment_date || null,
        comment: form.comment || null,
        salary_amount: form.salary_amount !== null && form.salary_amount !== undefined && String(form.salary_amount) !== ''
          ? Number(form.salary_amount)
          : null,
      };
      if (deal) {
        await updateDeal(deal.id, payload);
        toast.success('Сделка обновлена');
      } else {
        await createDeal(payload);
        toast.success('Сделка добавлена — сумма поступит в «Финансы» после подтверждения директором');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  }

  const remainder = Math.max(0, (form.total_amount || 0) - (form.paid_amount || 0)).toFixed(0);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deal ? 'Редактировать сделку' : 'Новая сделка'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="space-y-1">
            <Label>Дата сделки *</Label>
            <Input type="date" value={form.deal_date} onChange={e => set('deal_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Способ оплаты *</Label>
            <Select
              value={form.payment_method}
              onValueChange={v => {
                setForm(f => ({
                  ...f,
                  payment_method: v,
                  vat_gross_amount: v === 'Перечисление' ? f.vat_gross_amount : null,
                  payment_split: v === SPLIT_PAYMENT_METHOD
                    ? (f.payment_split?.length ? f.payment_split : [{ channel: 'Наличные', amount: Number(f.paid_amount || 0) }, { channel: 'Kaspi Bank', amount: 0 }])
                    : null,
                }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>ФИО клиента</Label>
            <Input placeholder="Иванов Иван" value={form.client_name || ''} onChange={e => set('client_name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Телефон клиента</Label>
            <Input placeholder="+7 700 000 0000" value={form.client_phone || ''} onChange={e => set('client_phone', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Номер договора</Label>
            <Input placeholder="26.53" value={form.contract_number || ''} onChange={e => set('contract_number', e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Адрес доставки</Label>
            <Input placeholder="ул. Примерная, д. 1" value={form.address || ''} onChange={e => set('address', e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Модель дверей</Label>
            <Input placeholder="PE.O, PD..." value={form.door_model || ''} onChange={e => set('door_model', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Общая сумма (₸) *</Label>
            <Input
              type="number" min="0" value={form.total_amount || ''}
              onChange={e => set('total_amount', Number(e.target.value))}
            />
          </div>
          {form.payment_method === 'Перечисление' && (
            <div className="space-y-1">
              <Label>Сумма с НДС (₸) *</Label>
              <Input
                type="number" min="0"
                placeholder="Например: 1 000 000"
                value={form.vat_gross_amount || ''}
                onChange={e => set('vat_gross_amount', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>Оплачено (₸)</Label>
            <Input
              type="number" min="0" value={form.paid_amount || ''}
              disabled={deal?.status === 'approved'}
              title={deal?.status === 'approved' ? 'У подтверждённой сделки оплаты вносятся через кнопку «Оплаты»' : undefined}
              onChange={e => set('paid_amount', Number(e.target.value))}
            />
            {deal?.status === 'approved' && (
              <p className="text-[11px] text-muted-foreground">Сделка подтверждена — новые оплаты вносите через кнопку «Оплаты» в строке сделки</p>
            )}
          </div>
          {form.payment_method === SPLIT_PAYMENT_METHOD && deal?.status !== 'approved' && (
            <div className="md:col-span-2 rounded-xl border border-border p-3 space-y-2">
              <p className="text-sm font-medium">Как оплачено «Оплачено» — по способам</p>
              <p className="text-[11px] text-muted-foreground">При подтверждении каждая часть попадёт в «Финансы» в свою кассу.</p>
              {(form.payment_split ?? []).map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={row.channel} onValueChange={v => setForm(f => ({ ...f, payment_split: (f.payment_split ?? []).map((r, j) => j === i ? { ...r, channel: v } : r) }))}>
                    <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" min="0" className="h-9" placeholder="Сумма" value={row.amount || ''}
                    onChange={e => setForm(f => ({ ...f, payment_split: (f.payment_split ?? []).map((r, j) => j === i ? { ...r, amount: Number(e.target.value) } : r) }))} />
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground"
                    onClick={() => setForm(f => ({ ...f, payment_split: (f.payment_split ?? []).filter((_, j) => j !== i) }))}>✕</Button>
                </div>
              ))}
              {(() => {
                const sum = (form.payment_split ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
                const rest = Number(form.paid_amount || 0) - sum;
                return (
                  <div className="flex items-center justify-between gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
                      onClick={() => setForm(f => ({ ...f, payment_split: [...(f.payment_split ?? []), { channel: 'Kaspi Bank', amount: Math.max(0, rest) }] }))}>
                      + Добавить способ
                    </Button>
                    <span className={`text-xs ${Math.round(rest) === 0 ? 'text-green-700' : 'text-amber-700'}`}>
                      {Math.round(rest) === 0 ? 'Сходится с «Оплачено»' : rest > 0 ? `Не распределено ${rest.toLocaleString('ru-RU')} ₸` : `Лишнее ${(-rest).toLocaleString('ru-RU')} ₸`}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
          <div className="space-y-1">
            <Label>Дата предоплаты</Label>
            <Input type="date" value={form.prepayment_date || ''} onChange={e => set('prepayment_date', e.target.value || null)} />
          </div>
          <div className="space-y-1">
            <Label>Дата следующей доплаты <span className="text-muted-foreground font-normal">(несколько доплат — в «График доплат» у сделки)</span></Label>
            <Input type="date" value={form.next_payment_date || ''} onChange={e => set('next_payment_date', e.target.value || null)} />
          </div>
          <div className="space-y-1">
            <Label>Стадия установки</Label>
            <Select value={form.stage} onValueChange={v => set('stage', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map(s => <SelectItem key={s} value={s}>{INSTALL_STAGE_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>
              Сумма для ЗП (₸)
              <span className="ml-1 text-muted-foreground font-normal text-xs">— для расчёта комиссии</span>
            </Label>
            <Input
              type="number" min="0"
              placeholder={`По умолчанию: ${(form.total_amount || 0).toLocaleString('ru-RU')}`}
              value={form.salary_amount !== null && form.salary_amount !== undefined ? form.salary_amount : ''}
              onChange={e => set('salary_amount', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Комментарий</Label>
            <Input
              placeholder="Заметки по сделке..."
              value={form.comment || ''}
              onChange={e => set('comment', e.target.value || null)}
            />
          </div>

          {/* Auto-calculated */}
          <div className="md:col-span-2 rounded-md bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Остаток:</span>
            <span className="ml-2 font-medium">{Number(remainder).toLocaleString('ru-RU')} ₸</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
