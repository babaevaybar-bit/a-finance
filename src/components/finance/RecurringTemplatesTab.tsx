import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Repeat } from 'lucide-react';
import {
  getRecurringExpenseTemplates, createRecurringExpenseTemplate,
  updateRecurringExpenseTemplate, deleteRecurringExpenseTemplate,
} from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { CHANNELS, EXPENSE_CATEGORIES } from '@/types/types';
import type { RecurringExpenseTemplate } from '@/types/types';

/**
 * Шаблоны расходов, которые повторяются каждый месяц (аренда, коммуналка,
 * подписки). Расход создаётся сам в указанное число месяца — не нужно
 * вбивать заново каждый месяц.
 */
export default function RecurringTemplatesTab() {
  const [items, setItems] = useState<RecurringExpenseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<string>('Аренда');
  const [channel, setChannel] = useState<string>('Kaspi Bank');
  const [day, setDay] = useState(1);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getRecurringExpenseTemplates()); } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!description.trim() || amount <= 0) { toast.error('Укажите название и сумму'); return; }
    setSaving(true);
    try {
      await createRecurringExpenseTemplate({ description: description.trim(), amount, category, channel, day_of_month: day, is_active: true });
      setDescription(''); setAmount(0);
      toast.success('Шаблон добавлен — расход будет создаваться автоматически');
      await load();
    } catch { toast.error('Ошибка'); }
    finally { setSaving(false); }
  }

  async function toggleActive(t: RecurringExpenseTemplate) {
    setItems(prev => prev.map(i => i.id === t.id ? { ...i, is_active: !i.is_active } : i));
    try { await updateRecurringExpenseTemplate(t.id, { is_active: !t.is_active }); } catch { await load(); }
  }

  async function handleDelete(t: RecurringExpenseTemplate) {
    try { await deleteRecurringExpenseTemplate(t.id); await load(); } catch { toast.error('Ошибка'); }
  }

  const monthlyTotal = items.filter(i => i.is_active).reduce((s, i) => s + Number(i.amount), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Repeat size={16} />Повторяющиеся расходы</CardTitle>
        <p className="text-xs text-muted-foreground">
          Расход создаётся сам в указанное число каждого месяца. Сейчас активно на {formatCurrency(monthlyTotal)} в месяц.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Название</Label>
            <Input className="h-9" placeholder="Аренда салона" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Сумма</Label>
            <Input className="h-9" type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Категория</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Канал</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Число месяца</Label>
            <Input className="h-9" type="number" min={1} max={28} value={day}
              onChange={e => setDay(Math.max(1, Math.min(28, Number(e.target.value))))} />
          </div>
          <Button className="col-span-2 md:col-span-6" onClick={handleCreate} disabled={saving}>
            <Plus size={14} className="mr-1" />Добавить шаблон
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Шаблонов пока нет</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {items.map(t => (
              <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 ${t.is_active ? '' : 'opacity-50'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.description}</p>
                  <p className="text-xs text-muted-foreground">{t.category} · {t.channel} · каждое {t.day_of_month}-е число</p>
                </div>
                <span className="text-sm font-semibold shrink-0">{formatCurrency(t.amount)}</span>
                <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(t)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
