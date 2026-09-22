import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { Layers, RefreshCw, Search, PhoneIncoming, UserPlus, ArrowRightLeft } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';

interface AmoLead {
  id: number;
  name: string;
  price: number;
  created_at: number;
  status_name: string | null;
  pipeline_name: string | null;
  responsible_user_name: string | null;
  is_lost: boolean;
}

interface DayPoint { date: string; count: number; }
interface CallDayPoint { date: string; incoming: number; outgoing: number; total: number; }
interface FunnelStage { status_id: string; status_name: string; pipeline_name: string; color: string; count: number; }
interface Transition {
  lead_id: number; lead_name: string; from_status: string | null; to_status: string | null;
  changed_at: number; manager_name: string | null;
}
interface TodayStats { newLeads: number; calls: number; callsIn: number; callsOut: number; statusChanges: number; }
interface UserDaily {
  user_id: string; user_name: string; newLeads: number;
  callsIn: number; callsOut: number; callsTotal: number; chats: number;
}

function unixToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
function shortDay(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
function timeAgo(ts: number): string {
  return new Date(ts * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AmoCrmPage() {
  const [leads, setLeads] = useState<AmoLead[]>([]);
  const [leadsByDay, setLeadsByDay] = useState<DayPoint[]>([]);
  const [callsByDay, setCallsByDay] = useState<CallDayPoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [dailyByUser, setDailyByUser] = useState<UserDaily[]>([]);
  const [today, setToday] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('amocrm-leads', {
        method: 'GET',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.error || res.data?.error) {
        setError(res.data?.error ?? res.error?.message ?? 'Ошибка загрузки');
        setLeads([]);
      } else {
        setLeads(res.data?.leads ?? []);
        setLeadsByDay(res.data?.leadsByDay ?? []);
        setCallsByDay(res.data?.callsByDay ?? []);
        setFunnel(res.data?.funnel ?? []);
        setTransitions(res.data?.recentTransitions ?? []);
        setDailyByUser(res.data?.dailyByUser ?? []);
        setToday(res.data?.todayStats ?? null);
      }
    } catch {
      setError('Не удалось связаться с amoCRM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filteredLeads = q ? leads.filter(l => (l.name || '').toLowerCase().includes(q)) : leads;
  const totalAmount = filteredLeads.reduce((s, l) => s + Number(l.price || 0), 0);
  const funnelMax = Math.max(1, ...funnel.map(f => f.count));

  const chartData = leadsByDay.map((d, i) => ({
    date: shortDay(d.date),
    Лиды: d.count,
    Звонки: callsByDay[i]?.total ?? 0,
  }));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Layers size={20} className="text-primary" />
              amoCRM
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Активность CRM — без захода в саму amoCRM</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {!error && (
          <>
            {/* Сегодня */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><UserPlus size={13} /> Новых лидов сегодня</div>
                <p className="text-lg font-semibold mt-1">{today?.newLeads ?? '—'}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><PhoneIncoming size={13} /> Звонков сегодня</div>
                <p className="text-lg font-semibold mt-1">{today?.calls ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {today ? `вход ${today.callsIn} / исход ${today.callsOut}` : ''}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowRightLeft size={13} /> Переходов по этапам сегодня</div>
                <p className="text-lg font-semibold mt-1">{today?.statusChanges ?? '—'}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Сумма сделок (список ниже)</p>
                <p className="text-lg font-semibold mt-1">{formatCurrency(totalAmount)}</p>
              </div>
            </div>

            {/* Ежедневный отчёт по сотрудникам */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Ежедневный отчёт по сотрудникам — сегодня</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {dailyByUser.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-6 py-4">Пока нет активности за сегодня</p>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Сотрудник</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Новых лидов</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Звонков (вход/исход)</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Чатов обработано</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyByUser.map(u => (
                          <TableRow key={u.user_id}>
                            <TableCell className="whitespace-nowrap text-sm font-medium">{u.user_name}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-right">{u.newLeads}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-right">
                              {u.callsTotal} <span className="text-muted-foreground">({u.callsIn}/{u.callsOut})</span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-right">{u.chats}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Графики по дням */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Новые лиды по дням (30 дней)</CardTitle>
                </CardHeader>
                <CardContent className="pl-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={28} />
                      <Tooltip />
                      <Line type="monotone" dataKey="Лиды" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Звонки по дням (30 дней)</CardTitle>
                </CardHeader>
                <CardContent className="pl-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={callsByDay.map(d => ({ date: shortDay(d.date), Входящие: d.incoming, Исходящие: d.outgoing }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={28} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Входящие" stackId="c" fill="#22c55e" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Исходящие" stackId="c" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Воронка + последние переходы */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Воронка — сколько сделок на каждом этапе (30 дней)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {funnel.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет данных</p>
                  ) : funnel.map(f => (
                    <div key={f.status_id}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-foreground">{f.status_name}</span>
                        <span className="text-muted-foreground">{f.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(f.count / funnelMax) * 100}%`, backgroundColor: f.color }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Последние переходы по этапам</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[280px] overflow-y-auto divide-y divide-border">
                    {transitions.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-4 py-3">Нет переходов за последние 30 дней</p>
                    ) : transitions.map((t, i) => (
                      <div key={i} className="px-4 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{t.lead_name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{timeAgo(t.changed_at)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <span>{t.from_status ?? '—'}</span>
                          <ArrowRightLeft size={10} />
                          <span className="text-foreground">{t.to_status ?? '—'}</span>
                          {t.manager_name && <span className="ml-auto">{t.manager_name}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Список сделок */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Сделки</CardTitle>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию" className="h-9 pl-7 w-56" />
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">Загрузка...</div>
            ) : filteredLeads.length === 0 && !error ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">Сделок не найдено</div>
            ) : !error && (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Дата создания</TableHead>
                      <TableHead className="whitespace-nowrap">Название</TableHead>
                      <TableHead className="whitespace-nowrap">Воронка / статус</TableHead>
                      <TableHead className="whitespace-nowrap">Ответственный</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Сумма</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(unixToDate(l.created_at))}</TableCell>
                        <TableCell className="text-sm max-w-[240px] truncate">{l.name || `Сделка #${l.id}`}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">{l.pipeline_name || '—'}</span>
                            <Badge variant="secondary" className="text-[11px] font-normal w-fit">
                              {l.status_name || '—'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{l.responsible_user_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(l.price || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
