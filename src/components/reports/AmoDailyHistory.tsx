import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Store, CalendarDays, ChevronRight, Download, MessageSquare, Phone, UserPlus, ArrowRightLeft, Trophy, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface AmoDailyReport {
  report_date: string;
  period_from: string;
  period_to: string;
  leads: number;
  leads_sum: number;
  offline_leads?: number | null;
  offline_qualified?: number | null;
  calls_in: number;
  calls_out: number;
  chats: number;
  transitions: number;
  won_count: number;
  won_sum: number;
  by_user: { name: string; amocrm_user_id: string; leads: number; callsIn: number; callsOut: number; chats: number; offline?: number; offlineQualified?: number }[];
  funnel: { stage: string; count: number }[];
  report_text: string | null;
  sent: boolean | null;
  source: string;
}

const money = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₸`;
const dayLabel = (d: string) => {
  const t = new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
const periodLabel = (r: AmoDailyReport) => {
  const f = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${f(r.period_from)} — ${f(r.period_to)}`;
};

function isoDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** «Отчёты по дням» — каждый вечерний отчёт (20:00) сохраняется сюда автоматически. */
export default function AmoDailyHistory() {
  const [rows, setRows] = useState<AmoDailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<AmoDailyReport | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let q = supabase.from('amo_daily_reports').select('*').order('report_date', { ascending: false });
      if (from) q = q.gte('report_date', from);
      if (to) q = q.lte('report_date', to);
      const { data, error } = await q;
      if (!alive) return;
      if (error) toast.error('Не удалось загрузить отчёты');
      setRows((data as AmoDailyReport[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [from, to]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    leads: t.leads + r.leads, off: t.off + (r.offline_leads ?? 0), offQ: t.offQ + (r.offline_qualified ?? 0), calls: t.calls + r.calls_in + r.calls_out, chats: t.chats + r.chats,
    won: t.won + r.won_count, wonSum: t.wonSum + Number(r.won_sum || 0),
  }), { leads: 0, off: 0, offQ: 0, calls: 0, chats: 0, won: 0, wonSum: 0 }), [rows]);

  const chartData = useMemo(() => [...rows].reverse().map(r => ({
    day: shortDay(r.report_date), Лиды: r.leads, Салон: r.offline_leads ?? 0, Звонки: r.calls_in + r.calls_out, Чаты: r.chats,
  })), [rows]);

  // Итоги по сотрудникам за выбранный период
  const byManager = useMemo(() => {
    const m = new Map<string, { name: string; leads: number; off: number; offQ: number; calls: number; chats: number; days: number }>();
    for (const r of rows) for (const u of r.by_user ?? []) {
      const k = u.amocrm_user_id || u.name;
      const cur = m.get(k) ?? { name: u.name, leads: 0, off: 0, offQ: 0, calls: 0, chats: 0, days: 0 };
      cur.leads += u.leads; cur.off += u.offline ?? 0; cur.offQ += u.offlineQualified ?? 0; cur.calls += u.callsIn + u.callsOut; cur.chats += u.chats;
      if (u.leads || u.callsIn || u.callsOut || u.chats) cur.days += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => (b.leads + b.calls + b.chats) - (a.leads + a.calls + a.chats));
  }, [rows]);

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const data = [...rows].reverse().map(r => {
      const row: Record<string, string | number> = {
        'Дата': r.report_date, 'Период': periodLabel(r), 'Новых лидов': r.leads, 'Сумма лидов': Number(r.leads_sum), 'Офлайн‑лидов': r.offline_leads ?? 0, 'Офлайн квал': r.offline_qualified ?? 0,
        'Звонков вход': r.calls_in, 'Звонков исход': r.calls_out, 'Чатов': r.chats, 'Переходов': r.transitions,
        'Успешно': r.won_count, 'Сумма успешных': Number(r.won_sum),
      };
      for (const u of r.by_user ?? []) {
        row[`${u.name}: лиды`] = u.leads;
        row[`${u.name}: офлайн`] = u.offline ?? 0;
        row[`${u.name}: звонки`] = u.callsIn + u.callsOut;
        row[`${u.name}: чаты`] = u.chats;
      }
      return row;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Отчёты по дням');
    XLSX.writeFile(wb, `Отчёты по дням ${from || ''}${to ? '—' + to : ''}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">С</p>
          <Input type="date" className="h-9 w-[150px]" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">По</p>
          <Input type="date" className="h-9 w-[150px]" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map(n => (
            <Button key={n} size="sm" variant="outline" className="h-9" onClick={() => { setFrom(isoDaysAgo(n)); setTo(''); }}>{n} дн.</Button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9" onClick={exportXlsx} disabled={!rows.length}>
          <Download size={14} className="mr-1.5" />Excel
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Каждый вечер в 20:00 отчёт из WhatsApp автоматически записывается сюда. День считается с 20:00 до 20:00.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { icon: UserPlus, label: 'Новых лидов', v: totals.leads },
          { icon: Store, label: 'Офлайн (салон)', v: totals.off ? `${totals.off} · квал ${totals.offQ}` : 0 },
          { icon: Phone, label: 'Звонков', v: totals.calls },
          { icon: MessageSquare, label: 'Чатов', v: totals.chats },
          { icon: Trophy, label: 'Успешно', v: totals.won },
          { icon: Trophy, label: 'Сумма успешных', v: money(totals.wonSum) },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><t.icon size={13} />{t.label} за период</div>
            <p className="text-lg font-semibold mt-1">{loading ? '…' : t.v}</p>
          </div>
        ))}
      </div>

      {chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">По дням</CardTitle></CardHeader>
          <CardContent className="h-[240px] pl-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Лиды" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Салон" fill="#d97706" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Звонки" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Чаты" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Отчёты ({rows.length})</CardTitle></CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">Загрузка…</p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">За выбранный период отчётов нет. Первый появится сегодня в 20:00.</p>
          ) : (
            <div className="divide-y divide-border">
              {rows.map(r => (
                <button key={r.report_date} type="button" onClick={() => setOpen(r)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/40 flex items-center gap-3">
                  <div className="w-[150px] shrink-0">
                    <div className="font-medium flex items-center gap-1.5"><CalendarDays size={14} className="text-muted-foreground" />{dayLabel(r.report_date)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {r.source === 'backfill' ? 'восстановлен из amoCRM' : r.sent ? 'отправлен в WhatsApp' : r.sent === false ? 'не отправлен в WhatsApp' : ''}
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-6 gap-x-4 gap-y-1 text-sm">
                    <span><span className="text-muted-foreground">Лиды</span> <b>{r.leads}</b></span>
                    <span><span className="text-muted-foreground">Салон</span> <b>{r.offline_leads ?? '—'}</b></span>
                    <span><span className="text-muted-foreground">Звонки</span> <b>{r.calls_in + r.calls_out}</b></span>
                    <span><span className="text-muted-foreground">Чаты</span> <b>{r.chats}</b></span>
                    <span><span className="text-muted-foreground">Переходы</span> <b>{r.transitions}</b></span>
                    <span><span className="text-muted-foreground">Успешно</span> <b>{r.won_count}</b></span>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {byManager.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Сотрудники за период</CardTitle></CardHeader>
          <CardContent className="px-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Сотрудник</th>
                  <th className="text-right font-medium px-4 py-2">Лиды</th>
                  <th className="text-right font-medium px-4 py-2">Салон (квал)</th>
                  <th className="text-right font-medium px-4 py-2">Звонки</th>
                  <th className="text-right font-medium px-4 py-2">Чаты</th>
                  <th className="text-right font-medium px-4 py-2">Активных дней</th>
                </tr>
              </thead>
              <tbody>
                {byManager.map(m => (
                  <tr key={m.name} className="border-t border-border">
                    <td className="px-4 py-2">{m.name}</td>
                    <td className="px-4 py-2 text-right">{m.leads}</td>
                    <td className="px-4 py-2 text-right">{m.off}{m.off ? <span className="text-muted-foreground"> ({m.offQ})</span> : null}</td>
                    <td className="px-4 py-2 text-right">{m.calls}</td>
                    <td className="px-4 py-2 text-right">{m.chats}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{m.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!open} onOpenChange={o => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-lg grid-cols-[minmax(0,1fr)] max-h-[90vh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>Отчёт — {dayLabel(open.report_date)}</DialogTitle>
                <p className="text-xs text-muted-foreground">Период: {periodLabel(open)}</p>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><UserPlus size={12} />Новых лидов</div><b>{open.leads}</b> <span className="text-xs text-muted-foreground">на {money(open.leads_sum)}</span></div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><Store size={12} />Офлайн‑лидов (салон)</div><b>{open.offline_leads ?? '—'}</b> {open.offline_leads ? <span className="text-xs text-muted-foreground">квал {open.offline_qualified ?? 0} / не квал {open.offline_leads - (open.offline_qualified ?? 0)}</span> : null}</div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={12} />Звонков</div><b>{open.calls_in + open.calls_out}</b> <span className="text-xs text-muted-foreground">вход {open.calls_in} / исход {open.calls_out}</span></div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquare size={12} />Чатов</div><b>{open.chats}</b></div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><ArrowRightLeft size={12} />Переходов по этапам</div><b>{open.transitions}</b></div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><Trophy size={12} />Успешно реализовано</div><b>{open.won_count}</b> <span className="text-xs text-muted-foreground">на {money(open.won_sum)}</span></div>
              </div>
              <div>
                <p className="text-sm font-medium mb-1.5">По сотрудникам</p>
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs">
                    <tr><th className="text-left font-medium py-1">Сотрудник</th><th className="text-right font-medium">Лиды</th><th className="text-right font-medium">Салон</th><th className="text-right font-medium">Звонки</th><th className="text-right font-medium">Чаты</th></tr>
                  </thead>
                  <tbody>
                    {(open.by_user ?? []).map(u => (
                      <tr key={u.amocrm_user_id || u.name} className="border-t border-border">
                        <td className="py-1.5">{u.name}</td>
                        <td className="text-right">{u.leads}</td>
                        <td className="text-right">{u.offline ?? 0}</td>
                        <td className="text-right">{u.callsIn + u.callsOut}</td>
                        <td className="text-right">{u.chats}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {open.funnel?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1.5">Воронка на момент отчёта</p>
                  <div className="flex flex-wrap gap-1.5">
                    {open.funnel.map(f => <Badge key={f.stage} variant="outline" className="font-normal">{f.stage}: {f.count}</Badge>)}
                  </div>
                </div>
              )}
              {open.report_text && (
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(open.report_text ?? '').then(() => toast.success('Текст отчёта скопирован')); }}>
                  <Copy size={13} className="mr-1.5" />Скопировать текст для WhatsApp
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
