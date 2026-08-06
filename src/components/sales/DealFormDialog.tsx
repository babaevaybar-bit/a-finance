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
import { PAYMENT_METHODS } from '@/types/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  managerId: string;
  monthYear: string;
  deal?: Deal | null;
}

const EMPTY: Omit<Deal, 'id' | 'created_at' | 'updated_at'> = {
  manager_id: '',
  month_year: '',
  deal_date: new Date().toISOString().slice(0, 10),
  client_phone: '',
  address: '',
  client_name: '',
  payment_method: 'Kaspi Bank',
  door_model: '',
  total_amount: 0,
  paid_amount: 0,
  prepayment_date: null,
  comment: null,
  salary_amount: null,
  status: 'pending',
};

export default function DealFormDialog({ open, onClose, onSaved, managerId, monthYear, deal }: Props) {
  const [form, setForm] = useState(EMPTY);
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
        comment: deal.comment || null,
        salary_amount: deal.salary_amount ?? null,
        status: deal.status ?? 'pending',
      });
    } else {
      setForm({ ...EMPTY, manager_id: managerId, month_year: monthYear });
    }
  }, [deal, managerId, monthYear, open]);

  const set = (key: keyof typeof form, val: string | number | null) =>
    setForm(f => ({ ...f, [key]: val }));

  async function handleSave() {
    if (!form.deal_date) { toast.error('Укажите дату сделки'); return; }
    if (form.total_amount <= 0) { toast.error('Общая сумма должна быть больше 0'); return; }
    if (form.paid_amount > form.total_amount) { toast.error('Оплачено не может превышать общую сумму'); return; }
    if (form.salary_amount !== null && Number(form.salary_amount) < 0) { toast.error('Сумма для ЗП не может быть отрицательной'); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        manager_id: managerId,
        month_year: monthYear,
        client_phone: form.client_phone || null,
        address: form.address || null,
        client_name: form.client_name || null,
        door_model: form.door_model || null,
        prepayment_date: form.prepayment_date || null,
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
        toast.success('Сделка добавлена');
      }
      onSaved();
      onClose();
    } catch {
      toast.error('Ошибка при сохранении');
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
            <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
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
          <div className="space-y-1">
            <Label>Оплачено (₸)</Label>
            <Input
              type="number" min="0" value={form.paid_amount || ''}
              onChange={e => set('paid_amount', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Дата предоплаты</Label>
            <Input type="date" value={form.prepayment_date || ''} onChange={e => set('prepayment_date', e.target.value || null)} />
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
