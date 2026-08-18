import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, TrendingUp, Users, Target, Filter,
  Phone, MapPin, Flame, Thermometer, Snowflake, Search, Download,
  CheckSquare, Square,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, FunnelChart, Funnel, LabelList, Cell,
} from 'recharts';
import {
  getDailyReports, upsertDailyReport, deleteDailyReport,
  getClientReports, upsertClientReportWithLog, deleteClientReport,
  getManagers, getSalesPlans,
} from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type {
  DailyReport, ClientReport, ClientQuality, DealStage, ContactType, Manager,
} from '@/types/types';
import {
  CLIENT_QUALITY_LABELS, DEAL_STAGE_LABELS, CONTACT_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
} from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';
import ClientCard from '@/components/crm/ClientCard';
import * as XLSX from 'xlsx';

// ─── Утилиты ─────────────────────────────────────────────────────────────────
function calcMarketingAnalytics(reports: DailyReport[]) {
  const totals = reports.reduce((acc, r) => ({
    new_clients:  acc.new_clients  + Number(r.new_clients),
    leads:        acc.leads        + Number(r.leads),
    closed_deals: acc.closed_deals + Number(r.closed_deals),
    sales_amount: acc.sales_amount + Number(r.sales_amount),
    ad_cost:      acc.ad_cost      + Number(r.ad_cost),
  }), { new_clients: 0, leads: 0, closed_deals: 0, sales_amount: 0, ad_cost: 0 });
  const conversion = totals.leads > 0 ? (totals.closed_deals / totals.leads) * 100 : 0;
  const cac        = totals.new_clients > 0 ? totals.ad_cost / totals.new_clients : 0;
  const roi        = totals.ad_cost > 0 ? ((totals.sales_amount - totals.ad_cost) / totals.ad_cost) * 100 : 0;
  return { ...totals, conversion, cac, roi };
}

// Группировка по дате для графиков
function buildChartData(reports: DailyReport[]) {
  const map: Record<string, { date: string; conversion: number; roi: number; leads: number; closed: number; ad_cost: number; sales: number }> = {};
  reports.forEach(r => {
    if (!map[r.report_date]) map[r.report_date] = { date: r.report_date, conversion: 0, roi: 0, leads: 0, closed: 0, ad_cost: 0, sales: 0 };
    map[r.report_date].leads    += Number(r.leads);
    map[r.report_date].closed   += Number(r.closed_deals);
    map[r.report_date].ad_cost  += Number(r.ad_cost);
    map[r.report_date].sales    += Number(r.sales_amount);
  });
  return Object.values(map)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      ...d,
      conversion: d.leads > 0 ? parseFloat((d.closed / d.leads * 100).toFixed(1)) : 0,
      roi: d.ad_cost > 0 ? parseFloat(((d.sales - d.ad_cost) / d.ad_cost * 100).toFixed(1)) : 0,
    }));
}

const QUALITY_COLORS: Record<ClientQuality, string> = {
  cold: 'bg-blue-100 text-blue-700 border-blue-200',
  warm: 'bg-amber-100 text-amber-700 border-amber-200',
  hot:  'bg-red-100 text-red-700 border-red-200',
};
const QUALITY_ICONS: Record<ClientQuality, React.ReactNode> = {
  cold: <Snowflake size={11} />,
  warm: <Thermometer size={11} />,
  hot:  <Flame size={11} />,
};
const STAGE_COLORS: Record<DealStage, string> = {
  new:         'bg-muted text-muted-foreground',
  negotiation: 'bg-blue-50 text-blue-700',
  viewing:     'bg-purple-50 text-purple-700',
  offer:       'bg-amber-50 text-amber-700',
  closed:      'bg-green-50 text-green-700',
  rejected:    'bg-red-50 text-red-700',
};

// ─── Пустые формы ─────────────────────────────────────────────────────────────
function emptyMarketingForm() {
  return {
    report_date: new Date().toISOString().slice(0, 10),
    channel: '', new_clients: 0, leads: 0, closed_deals: 0,
    sales_amount: 0, ad_cost: 0, comment: '',
  };
}
function emptyClientForm(): Omit<ClientReport, 'id' | 'created_at' | 'updated_at'> {
  return {
    report_date: new Date().toISOString().slice(0, 10),
    manager_id: null,
    client_name: '', client_phone: '', client_quality: 'cold',
    address: '', property_type: '', area_sqm: null, budget: null,
    source: '', contact_type: 'call', deal_stage: 'new',
    next_action: '', next_action_date: null,
    is_deal_closed: false, deal_amount: 0, comment: '',
    tags: [], lead_source: 'other',
  };
}

// ─── Компонент маркетингового раздела ─────────────────────────────────────────
function MarketingTab() {
  const [reports, setReports]       = useState<DailyReport[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState(emptyMarketingForm());
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo]     = useState('');
  const [filterChannel, setFilterChannel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDailyReports({
        from: filterFrom || undefined, to: filterTo || undefined,
        channel: filterChannel || undefined,
      });
      setReports(data);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [filterFrom, filterTo, filterChannel]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditId(null); setForm(emptyMarketingForm()); setDialogOpen(true); }
  function openEdit(r: DailyReport) {
    setEditId(r.id);
    setForm({ report_date: r.report_date, channel: r.channel, new_clients: r.new_clients,
      leads: r.leads, closed_deals: r.closed_deals, sales_amount: r.sales_amount,
      ad_cost: r.ad_cost, comment: r.comment ?? '' });
    setDialogOpen(true);
  }
  function sf<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.channel.trim()) { toast.error('Укажите канал'); return; }
    setSaving(true);
    try {
      await upsertDailyReport({
        ...(editId ? { id: editId } : {}),
        report_date: form.report_date, channel: form.channel.trim(),
        new_clients: Number(form.new_clients), leads: Number(form.leads),
        closed_deals: Number(form.closed_deals), sales_amount: Number(form.sales_amount),
        ad_cost: Number(form.ad_cost), comment: form.comment?.trim() || null, created_by: null,
      });
      toast.success(editId ? 'Обновлено' : 'Добавлено');
      setDialogOpen(false); await load();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  }

  const channels  = Array.from(new Set(reports.map(r => r.channel))).sort();
  const analytics = calcMarketingAnalytics(reports);
  const chartData = buildChartData(reports);

  return (
    <div className="space-y-4">
      {/* Фильтры + кнопка */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">С</Label>
            <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 text-sm w-34" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">По</Label>
            <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 text-sm w-34" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Канал</Label>
            <Input placeholder="Все" value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
              list="ch-list" className="h-8 text-sm w-36" />
            <datalist id="ch-list">{channels.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <Button size="sm" className="h-8" onClick={load}><Filter size={13} className="mr-1" />Фильтр</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterChannel(''); }}>Сброс</Button>
        </div>
        <Button onClick={openCreate} className="gap-1 shrink-0"><Plus size={15} />Добавить</Button>
      </div>

      {/* KPI */}
      {reports.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { icon: <Target size={14} />, label: 'Конверсия', value: `${analytics.conversion.toFixed(1)}%`, sub: `${analytics.closed_deals} из ${analytics.leads}` },
            { icon: <Users size={14} />, label: 'CAC', value: formatCurrency(analytics.cac), sub: `${analytics.new_clients} клиентов` },
            { icon: <TrendingUp size={14} />, label: 'ROI', value: `${analytics.roi.toFixed(1)}%`, sub: `Реклама: ${formatCurrency(analytics.ad_cost)}`, neg: analytics.roi < 0 },
          ].map(({ icon, label, value, sub, neg }) => (
            <Card key={label} className="border border-border">
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
                <div className={`text-xl font-semibold ${neg ? 'text-destructive' : ''}`}>{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Графики */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border border-border">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm font-medium">Конверсия по дням (%)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <div className="w-full min-w-0 overflow-hidden h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: number) => [`${v}%`, 'Конверсия']} labelFormatter={l => `Дата: ${l}`} />
                    <Line type="monotone" dataKey="conversion" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Конверсия" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm font-medium">ROI маркетинга по дням (%)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <div className="w-full min-w-0 overflow-hidden h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v: number) => [`${v}%`, 'ROI']} labelFormatter={l => `Дата: ${l}`} />
                    <Bar dataKey="roi" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="ROI" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border md:col-span-2">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm font-medium">Заявки и сделки по дням</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <div className="w-full min-w-0 overflow-hidden h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={l => `Дата: ${l}`} />
                    <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8 }} />
                    <Bar dataKey="leads"  fill="hsl(var(--muted-foreground))" radius={[3,3,0,0]} name="Заявки" />
                    <Bar dataKey="closed" fill="hsl(var(--primary))"          radius={[3,3,0,0]} name="Сделки" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Таблица */}
      <Card className="border border-border">
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <div key={i} className="h-9 rounded bg-muted animate-pulse" />)}</div>
          ) : reports.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Нет записей</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  {['Дата','Канал','Клиенты','Заявки','Сделки','Продажи','Реклама','Конв.','CAC',''].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {reports.map(r => {
                    const conv = r.leads > 0 ? `${(r.closed_deals / r.leads * 100).toFixed(0)}%` : '—';
                    const cac  = r.new_clients > 0 ? formatCurrency(r.ad_cost / r.new_clients) : '—';
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 whitespace-nowrap">{r.report_date}</td>
                        <td className="px-4 py-2 whitespace-nowrap"><Badge variant="outline" className="text-xs font-normal">{r.channel}</Badge></td>
                        <td className="px-4 py-2 text-center">{r.new_clients}</td>
                        <td className="px-4 py-2 text-center">{r.leads}</td>
                        <td className="px-4 py-2 text-center">{r.closed_deals}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{formatCurrency(r.sales_amount)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{formatCurrency(r.ad_cost)}</td>
                        <td className="px-4 py-2 text-center">{conv}</td>
                        <td className="px-4 py-2 whitespace-nowrap">{cac}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil size={13} /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Удалить запись?</AlertDialogTitle>
                                  <AlertDialogDescription>{r.report_date} ({r.channel})</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteDailyReport(r.id).then(load).catch(() => toast.error('Ошибка'))}>Удалить</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Диалог */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Редактировать' : 'Новая запись'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Дата *</Label>
                <Input type="date" value={form.report_date} onChange={e => sf('report_date', e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Канал *</Label>
                <Input placeholder="Instagram…" value={form.channel} list="ch-list2" onChange={e => sf('channel', e.target.value)} />
                <datalist id="ch-list2">{channels.map(c => <option key={c} value={c} />)}</datalist></div>
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-2">
              {[['new_clients','Клиентов'],['leads','Заявок'],['closed_deals','Сделок']].map(([k, l]) => (
                <div key={k} className="space-y-1"><Label className="text-xs">{l}</Label>
                  <Input type="number" min={0} value={form[k as keyof typeof form] as number}
                    onChange={e => sf(k as keyof typeof form, Number(e.target.value) as never)} /></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Сумма продаж</Label>
                <Input type="number" min={0} value={form.sales_amount} onChange={e => sf('sales_amount', Number(e.target.value))} /></div>
              <div className="space-y-1"><Label className="text-xs">Стоимость рекламы</Label>
                <Input type="number" min={0} value={form.ad_cost} onChange={e => sf('ad_cost', Number(e.target.value))} /></div>
            </div>
            {(Number(form.leads) > 0 || Number(form.ad_cost) > 0) && (
              <div className="bg-muted/40 rounded-lg px-3 py-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {Number(form.leads) > 0 && <span>Конверсия: <strong className="text-foreground">{(Number(form.closed_deals)/Number(form.leads)*100).toFixed(1)}%</strong></span>}
                {Number(form.ad_cost) > 0 && Number(form.new_clients) > 0 && <span>CAC: <strong className="text-foreground">{formatCurrency(Number(form.ad_cost)/Number(form.new_clients))}</strong></span>}
                {Number(form.ad_cost) > 0 && <span>ROI: <strong className="text-foreground">{((Number(form.sales_amount)-Number(form.ad_cost))/Number(form.ad_cost)*100).toFixed(1)}%</strong></span>}
              </div>
            )}
            <div className="space-y-1"><Label className="text-xs">Комментарий</Label>
              <Textarea rows={2} value={form.comment} onChange={e => sf('comment', e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Сохранение…' : editId ? 'Сохранить' : 'Добавить'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ─── Экспорт клиентов в Excel ─────────────────────────────────────────────────
function exportClientsToExcel(rows: ClientReport[], managers: Manager[]) {
  const mgrName = (id: string | null) => managers.find(m => m.user_id === id)?.name ?? '';
  const data = rows.map(r => ({
    'Дата':           r.report_date,
    'Менеджер':       mgrName(r.manager_id),
    'Клиент':         r.client_name,
    'Телефон':        r.client_phone ?? '',
    'Качество':       CLIENT_QUALITY_LABELS[r.client_quality],
    'Стадия':         DEAL_STAGE_LABELS[r.deal_stage],
    'Адрес/ЖК':       r.address ?? '',
    'Тип объекта':    r.property_type ?? '',
    'Площадь м²':     r.area_sqm ?? '',
    'Бюджет':         r.budget ?? '',
    'Источник':       LEAD_SOURCE_LABELS[r.lead_source] ?? r.lead_source,
    'Канал':          r.source ?? '',
    'Следующий шаг':  r.next_action ?? '',
    'Дата шага':      r.next_action_date ?? '',
    'Сумма сделки':   r.deal_amount,
    'Закрыта':        r.is_deal_closed ? 'Да' : 'Нет',
    'Теги':           (r.tags ?? []).join(', '),
    'Комментарий':    r.comment ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Клиенты');
  XLSX.writeFile(wb, `Клиенты_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ─── Воронка продаж ───────────────────────────────────────────────────────────
const FUNNEL_STAGE_ORDER: DealStage[] = ['new','negotiation','viewing','offer','closed'];
const FUNNEL_COLORS = [
  'hsl(var(--primary) / 0.9)',
  'hsl(var(--primary) / 0.72)',
  'hsl(var(--primary) / 0.54)',
  'hsl(var(--primary) / 0.36)',
  'hsl(var(--primary) / 0.2)',
];

function SalesFunnel({ reports }: { reports: ClientReport[] }) {
  const data = FUNNEL_STAGE_ORDER.map((stage, i) => ({
    name:  DEAL_STAGE_LABELS[stage],
    value: reports.filter(r => r.deal_stage === stage || (stage === 'closed' && r.is_deal_closed)).length,
    fill:  FUNNEL_COLORS[i],
  })).filter(d => d.value > 0);

  const top = data[0]?.value ?? 1;

  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const prev = i > 0 ? data[i-1].value : null;
        const pct  = Math.round((d.value / top) * 100);
        const conv = prev ? Math.round((d.value / prev) * 100) : null;
        return (
          <div key={d.name} className="flex items-center gap-3">
            <div className="w-28 shrink-0 text-xs text-right text-muted-foreground">{d.name}</div>
            <div className="flex-1 h-7 bg-muted/40 rounded-md overflow-hidden">
              <div className="h-full rounded-md flex items-center px-2 transition-all"
                style={{ width: `${pct}%`, backgroundColor: d.fill, minWidth: 32 }}>
                <span className="text-xs font-semibold text-foreground/80">{d.value}</span>
              </div>
            </div>
            {conv !== null && (
              <span className="text-xs text-muted-foreground w-14 shrink-0">→ {conv}%</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Динамика выручки ─────────────────────────────────────────────────────────
function buildRevenueChart(reports: ClientReport[]) {
  const map: Record<string, { date: string; revenue: number; clients: number }> = {};
  reports.forEach(r => {
    if (!map[r.report_date]) map[r.report_date] = { date: r.report_date, revenue: 0, clients: 0 };
    map[r.report_date].revenue  += Number(r.deal_amount);
    map[r.report_date].clients  += 1;
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Компонент вкладки «Клиенты» ──────────────────────────────────────────────
function ClientsTab() {
  const { user, isAdmin } = useAuth();
  const [reports, setReports]         = useState<ClientReport[]>([]);
  const [managers, setManagers]       = useState<Manager[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editId, setEditId]           = useState<string | null>(null);
  const [editRecord, setEditRecord]   = useState<ClientReport | null>(null);
  const [form, setForm]               = useState<Omit<ClientReport, 'id' | 'created_at' | 'updated_at'>>(emptyClientForm());

  // Карточка
  const [cardClient, setCardClient]   = useState<ClientReport | null>(null);
  const [cardOpen, setCardOpen]       = useState(false);

  // Поиск
  const [search, setSearch]           = useState('');

  // Фильтры
  const [filterFrom,    setFilterFrom]    = useState('');
  const [filterTo,      setFilterTo]      = useState('');
  const [filterQuality, setFilterQuality] = useState('all');
  const [filterStage,   setFilterStage]   = useState('all');
  const [filterMgr,     setFilterMgr]     = useState('all');

  // Массовые действия
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage]     = useState<DealStage | 'none'>('none');
  const [bulkMgr,   setBulkMgr]       = useState('none');

  // Тег
  const [tagInput, setTagInput]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, mgrs] = await Promise.all([
        getClientReports({
          from:       filterFrom   || undefined,
          to:         filterTo     || undefined,
          quality:    filterQuality !== 'all' ? filterQuality : undefined,
          stage:      filterStage  !== 'all' ? filterStage  : undefined,
          manager_id: filterMgr    !== 'all' ? filterMgr    : undefined,
        }),
        getManagers(),
      ]);
      setReports(data); setManagers(mgrs);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [filterFrom, filterTo, filterQuality, filterStage, filterMgr]);

  useEffect(() => { load(); }, [load]);

  // Клиентский поиск поверх DB-данных
  const displayed = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter(r =>
      r.client_name.toLowerCase().includes(q) ||
      (r.client_phone ?? '').toLowerCase().includes(q)
    );
  }, [reports, search]);

  function openCreate() {
    setEditId(null); setEditRecord(null);
    setForm({ ...emptyClientForm(), manager_id: user?.id ?? null });
    setDialogOpen(true);
  }
  function openEdit(r: ClientReport) {
    setEditId(r.id); setEditRecord(r);
    setForm({
      report_date: r.report_date, manager_id: r.manager_id,
      client_name: r.client_name, client_phone: r.client_phone ?? '',
      client_quality: r.client_quality, address: r.address ?? '',
      property_type: r.property_type ?? '', area_sqm: r.area_sqm,
      budget: r.budget, source: r.source ?? '',
      contact_type: r.contact_type ?? 'call', deal_stage: r.deal_stage,
      next_action: r.next_action ?? '', next_action_date: r.next_action_date,
      is_deal_closed: r.is_deal_closed, deal_amount: r.deal_amount,
      comment: r.comment ?? '', tags: r.tags ?? [], lead_source: r.lead_source ?? 'other',
    });
    setDialogOpen(true);
  }
  function sf<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm(f => ({ ...f, [k]: v })); }

  function addTag() {
    const t = tagInput.trim();
    if (!t || (form.tags ?? []).includes(t)) return;
    sf('tags', [...(form.tags ?? []), t]);
    setTagInput('');
  }
  function removeTag(t: string) { sf('tags', (form.tags ?? []).filter(x => x !== t)); }

  async function handleSave() {
    if (!form.client_name.trim()) { toast.error('Укажите имя клиента'); return; }
    setSaving(true);
    try {
      await upsertClientReportWithLog(
        {
          ...(editId ? { id: editId } : {}),
          ...form,
          client_name:   form.client_name.trim(),
          client_phone:  (form.client_phone as string)?.trim() || null,
          address:       (form.address as string)?.trim() || null,
          property_type: (form.property_type as string)?.trim() || null,
          source:        (form.source as string)?.trim() || null,
          next_action:   (form.next_action as string)?.trim() || null,
          comment:       (form.comment as string)?.trim() || null,
          deal_amount:   Number(form.deal_amount),
          tags:          form.tags ?? [],
          lead_source:   form.lead_source ?? 'other',
        },
        editRecord,
        user?.id ?? null
      );
      toast.success(editId ? 'Обновлено' : 'Клиент добавлен');
      setDialogOpen(false);
      await load();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  }

  // Массовые действия
  function toggleSelect(id: string) {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }
  function toggleAll() {
    setSelected(prev => prev.size === displayed.length ? new Set() : new Set(displayed.map(r => r.id)));
  }

  async function applyBulkStage() {
    if (bulkStage === 'none' || selected.size === 0) return;
    try {
      await Promise.all(
        displayed.filter(r => selected.has(r.id)).map(r =>
          upsertClientReportWithLog(
            { ...r, deal_stage: bulkStage as DealStage },
            r, user?.id ?? null
          )
        )
      );
      toast.success(`Стадия обновлена (${selected.size})`);
      setSelected(new Set()); setBulkStage('none'); await load();
    } catch { toast.error('Ошибка'); }
  }

  async function applyBulkMgr() {
    if (bulkMgr === 'none' || selected.size === 0) return;
    try {
      await Promise.all(
        displayed.filter(r => selected.has(r.id)).map(r =>
          upsertClientReportWithLog(
            { ...r, manager_id: bulkMgr },
            r, user?.id ?? null
          )
        )
      );
      toast.success(`Менеджер обновлён (${selected.size})`);
      setSelected(new Set()); setBulkMgr('none'); await load();
    } catch { toast.error('Ошибка'); }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    try {
      await Promise.all([...selected].map(id => deleteClientReport(id)));
      toast.success(`Удалено (${selected.size})`);
      setSelected(new Set()); await load();
    } catch { toast.error('Ошибка'); }
  }

  // KPI
  const total   = displayed.length;
  const hot     = displayed.filter(r => r.client_quality === 'hot').length;
  const closed  = displayed.filter(r => r.is_deal_closed).length;
  const revenue = displayed.reduce((s, r) => s + Number(r.deal_amount), 0);
  const revenueChart = buildRevenueChart(displayed);
  const managerName  = (id: string | null) => managers.find(m => m.user_id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      {/* Поиск + Фильтры + Кнопки */}
      <div className="flex flex-col gap-3">
        {/* Строка поиска */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Поиск по имени или телефону…" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <Button onClick={openCreate} className="gap-1 shrink-0 h-9">
            <Plus size={15} />Добавить клиента
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
            onClick={() => exportClientsToExcel(displayed, managers)} title="Экспорт в Excel">
            <Download size={15} />
          </Button>
        </div>

        {/* Фильтры */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1"><Label className="text-xs">С</Label>
            <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 text-sm w-34" /></div>
          <div className="flex flex-col gap-1"><Label className="text-xs">По</Label>
            <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 text-sm w-34" /></div>
          <div className="flex flex-col gap-1"><Label className="text-xs">Качество</Label>
            <Select value={filterQuality} onValueChange={setFilterQuality}>
              <SelectTrigger className="h-8 text-sm w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="cold">Холодный</SelectItem>
                <SelectItem value="warm">Тёплый</SelectItem>
                <SelectItem value="hot">Горячий</SelectItem>
              </SelectContent>
            </Select></div>
          <div className="flex flex-col gap-1"><Label className="text-xs">Стадия</Label>
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {(Object.entries(DEAL_STAGE_LABELS) as [DealStage, string][]).map(([k, v]) =>
                  <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select></div>
          {isAdmin && (
            <div className="flex flex-col gap-1"><Label className="text-xs">Менеджер</Label>
              <Select value={filterMgr} onValueChange={setFilterMgr}>
                <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  {managers.map(m => <SelectItem key={m.user_id ?? m.id} value={m.user_id ?? m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select></div>
          )}
          <Button size="sm" className="h-8" onClick={load}><Filter size={13} className="mr-1" />Фильтр</Button>
          <Button size="sm" variant="outline" className="h-8"
            onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterQuality('all'); setFilterStage('all'); setFilterMgr('all'); setSearch(''); }}>
            Сброс
          </Button>
        </div>

        {/* Массовые действия */}
        {selected.size > 0 && (
          <div className="flex flex-wrap gap-2 items-center p-2 bg-muted/50 rounded-lg border border-border">
            <span className="text-sm font-medium text-muted-foreground">Выбрано: {selected.size}</span>
            <Select value={bulkStage} onValueChange={v => setBulkStage(v as DealStage | 'none')}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Стадия…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Стадия —</SelectItem>
                {(Object.entries(DEAL_STAGE_LABELS) as [DealStage, string][]).map(([k, v]) =>
                  <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs" onClick={applyBulkStage} disabled={bulkStage === 'none'}>Применить стадию</Button>
            {isAdmin && (
              <>
                <Select value={bulkMgr} onValueChange={setBulkMgr}>
                  <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Менеджер…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Менеджер —</SelectItem>
                    {managers.map(m => <SelectItem key={m.user_id ?? m.id} value={m.user_id ?? m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" onClick={applyBulkMgr} disabled={bulkMgr === 'none'}>Назначить</Button>
              </>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 size={12} className="mr-1" />Удалить ({selected.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                <AlertDialogHeader><AlertDialogTitle>Удалить {selected.size} клиентов?</AlertDialogTitle>
                  <AlertDialogDescription>Действие необратимо.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkDelete}>Удалить</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelected(new Set())}>Снять выделение</Button>
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Всего клиентов',  value: total,                  icon: <Users size={14} /> },
          { label: 'Горячих',         value: hot,                    icon: <Flame size={14} /> },
          { label: 'Закрытых сделок', value: closed,                 icon: <Target size={14} /> },
          { label: 'Выручка',         value: formatCurrency(revenue), icon: <TrendingUp size={14} /> },
        ].map(({ label, value, icon }) => (
          <Card key={label} className="border border-border">
            <CardContent className="pt-3 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
              <div className="text-xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Аналитика: Динамика + Воронка */}
      {displayed.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border border-border">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm font-medium">Динамика клиентов и выручки</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <div className="w-full min-w-0 overflow-hidden h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueChart} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={l => `Дата: ${l}`} />
                    <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8 }} />
                    <Line yAxisId="left"  type="monotone" dataKey="clients" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={{ r: 3 }} name="Клиенты" />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))"          strokeWidth={2} dot={{ r: 3 }} name="Выручка" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-sm font-medium">Воронка продаж</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-2">
              <SalesFunnel reports={displayed} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Таблица */}
      <Card className="border border-border">
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="space-y-2 p-4">{[1,2,3].map(i => <div key={i} className="h-9 rounded bg-muted animate-pulse" />)}</div>
          ) : displayed.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Нет клиентов</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  <th className="px-3 py-2 w-8">
                    <Checkbox checked={selected.size === displayed.length && displayed.length > 0}
                      onCheckedChange={toggleAll} />
                  </th>
                  {['Дата','Менеджер','Клиент','Телефон','Качество','Адрес/ЖК','Источник','Стадия','Выручка',''].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {displayed.map(r => (
                    <tr key={r.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => { setCardClient(r); setCardOpen(true); }}>
                      <td className="px-3 py-2" onClick={e => { e.stopPropagation(); toggleSelect(r.id); }}>
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.report_date}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">{managerName(r.manager_id)}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{r.client_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.client_phone
                          ? <span className="flex items-center gap-1"><Phone size={11}/>{r.client_phone}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${QUALITY_COLORS[r.client_quality]}`}>
                          {QUALITY_ICONS[r.client_quality]}{CLIENT_QUALITY_LABELS[r.client_quality]}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.address
                          ? <span className="flex items-center gap-1"><MapPin size={11}/>{r.address}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {LEAD_SOURCE_LABELS[r.lead_source] ?? r.lead_source ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STAGE_COLORS[r.deal_stage]}`}>
                          {DEAL_STAGE_LABELS[r.deal_stage]}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.deal_amount > 0 ? formatCurrency(r.deal_amount) : '—'}
                      </td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil size={13} /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить клиента?</AlertDialogTitle>
                                <AlertDialogDescription>«{r.client_name}» будет удалён без возможности восстановления.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteClientReport(r.id).then(load).catch(() => toast.error('Ошибка'))}>Удалить</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Карточка клиента */}
      <ClientCard
        client={cardClient}
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        managers={managers}
        onClientUpdated={load}
      />

      {/* Диалог добавления/редактирования */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'Редактировать клиента' : 'Новый клиент'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Дата *</Label>
                <Input type="date" value={form.report_date} onChange={e => sf('report_date', e.target.value)} /></div>
              <div className="space-y-1 col-span-2 md:col-span-1"><Label className="text-xs">Имя клиента *</Label>
                <Input placeholder="Алибек Смаилов" value={form.client_name} onChange={e => sf('client_name', e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Телефон</Label>
                <Input placeholder="+7 700 000 00 00" value={form.client_phone ?? ''} onChange={e => sf('client_phone', e.target.value)} /></div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1"><Label className="text-xs">Качество</Label>
                <Select value={form.client_quality} onValueChange={v => sf('client_quality', v as ClientQuality)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold">❄️ Холодный</SelectItem>
                    <SelectItem value="warm">🌡 Тёплый</SelectItem>
                    <SelectItem value="hot">🔥 Горячий</SelectItem>
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Стадия</Label>
                <Select value={form.deal_stage} onValueChange={v => sf('deal_stage', v as DealStage)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(DEAL_STAGE_LABELS) as [DealStage, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Тип контакта</Label>
                <Select value={form.contact_type ?? 'call'} onValueChange={v => sf('contact_type', v as ContactType)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CONTACT_TYPE_LABELS) as [ContactType, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Источник лида</Label>
                <Select value={form.lead_source ?? 'other'} onValueChange={v => sf('lead_source', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Объект</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2 md:col-span-1"><Label className="text-xs">Адрес / ЖК</Label>
                <Input placeholder="ЖК Alatau City" value={form.address ?? ''} onChange={e => sf('address', e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Тип объекта</Label>
                <Input placeholder="Квартира, дом…" value={form.property_type ?? ''} onChange={e => sf('property_type', e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Площадь, м²</Label>
                <Input type="number" min={0} value={form.area_sqm ?? ''} onChange={e => sf('area_sqm', e.target.value ? Number(e.target.value) : null)} /></div>
              <div className="space-y-1"><Label className="text-xs">Бюджет</Label>
                <Input type="number" min={0} value={form.budget ?? ''} onChange={e => sf('budget', e.target.value ? Number(e.target.value) : null)} /></div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Канал привлечения</Label>
                <Input placeholder="Instagram…" value={form.source ?? ''} onChange={e => sf('source', e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Менеджер</Label>
                <Select value={form.manager_id ?? 'none'} onValueChange={v => sf('manager_id', v === 'none' ? null : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Выбрать" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {managers.map(m => <SelectItem key={m.user_id ?? m.id} value={m.user_id ?? m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-xs">Следующий шаг</Label>
                <Input placeholder="Показ объекта…" value={form.next_action ?? ''} onChange={e => sf('next_action', e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Дата шага</Label>
                <Input type="date" value={form.next_action_date ?? ''} onChange={e => sf('next_action_date', e.target.value || null)} /></div>
            </div>
            <Separator />
            {/* Теги */}
            <div className="space-y-2">
              <Label className="text-xs">Теги</Label>
              <div className="flex flex-wrap gap-1.5 min-h-6">
                {(form.tags ?? []).map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs gap-1 cursor-pointer"
                    onClick={() => removeTag(tag)}>{tag} ×</Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Новый тег…" value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); }}}
                  className="h-8 text-sm" />
                <Button size="sm" variant="outline" className="h-8" onClick={addTag}>Добавить</Button>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1"><Label className="text-xs">Сумма сделки</Label>
                <Input type="number" min={0} value={form.deal_amount} onChange={e => sf('deal_amount', Number(e.target.value))} /></div>
              <div className="flex items-center gap-2 pb-0.5">
                <input type="checkbox" id="deal-closed" checked={form.is_deal_closed}
                  onChange={e => sf('is_deal_closed', e.target.checked)}
                  className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                <Label htmlFor="deal-closed" className="text-sm cursor-pointer">Сделка закрыта</Label>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Комментарий</Label>
              <Textarea rows={2} value={form.comment ?? ''} onChange={e => sf('comment', e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Сохранение…' : editId ? 'Сохранить' : 'Добавить'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// ─── Главный компонент страницы ───────────────────────────────────────────────
export default function DailyReportPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Ежедневный отчёт</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Учёт маркетинговых кампаний и карточек клиентов
          </p>
        </div>
        <Tabs defaultValue="clients">
          <TabsList className="mb-4">
            <TabsTrigger value="clients">Клиенты</TabsTrigger>
            <TabsTrigger value="marketing">Маркетинг</TabsTrigger>
          </TabsList>
          <TabsContent value="clients"><ClientsTab /></TabsContent>
          <TabsContent value="marketing"><MarketingTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

