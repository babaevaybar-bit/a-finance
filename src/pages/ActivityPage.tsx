import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout, { navItems } from '@/components/layouts/AppLayout';
import { supabase } from '@/db/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserAvatar, ROLE_LABELS } from '@/components/common/UserAvatar';
import { getDealById } from '@/lib/api';
import type { Deal } from '@/types/types';
import { PERMISSION_PAGES } from '@/types/types';
import DealFormDialog from '@/components/sales/DealFormDialog';
import { toast } from 'sonner';
import {
  RefreshCw, PlusCircle, Pencil, Trash2, CheckCircle2, XCircle, Wallet, ArrowLeftRight, Users, ShieldCheck, Activity, Clock, LogIn,
} from 'lucide-react';

interface Person { id: string; name: string; role: string; email: string | null; avatar_url: string | null }
interface Presence { user_id: string; day: string; first_seen: string; last_seen: string; active_seconds: number; last_page: string | null }
interface LogRow { id: number; user_id: string | null; user_name: string | null; action: string; entity: string; entity_id: string | null; title: string; details: string | null; created_at: string }

const KZ = 'Asia/Qyzylorda';
const kzDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: KZ }).format(d);
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: KZ });
const dur = (sec: number) => {
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  if (m < 1) return '< 1 мин';
  const h = Math.floor(m / 60);
  return h ? `${h} ч ${m % 60} мин` : `${m} мин`;
};
function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 180) return 'на сайте сейчас';
  if (s < 3600) return `был(а) ${Math.round(s / 60)} мин назад`;
  if (s < 86400) return `был(а) ${Math.round(s / 3600)} ч назад`;
  return `был(а) ${new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}
const pageLabel = (p: string | null) => {
  if (!p) return null;
  if (p.startsWith('/boards/')) return 'Доски';
  if (p === '/welcome') return 'Приветствие';
  if (p === '/profile') return 'Мой профиль';
  return navItems.find(n => n.path === p)?.label ?? p;
};

// «debtors: просмотр» → «Должники: просмотр»
const prettyAccess = (s: string) => {
  const i = s.indexOf(':');
  const key = i > 0 ? s.slice(0, i) : s;
  const label = PERMISSION_PAGES.find(p => p.key === key)?.label;
  return label ? label + s.slice(i) : s;
};

const ACTION_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  create: { icon: PlusCircle, color: '#2563eb' },
  insert: { icon: PlusCircle, color: '#2563eb' },
  update: { icon: Pencil, color: '#d97706' },
  delete: { icon: Trash2, color: '#dc2626' },
  approve: { icon: CheckCircle2, color: '#059669' },
  reject: { icon: XCircle, color: '#dc2626' },
  payment: { icon: Wallet, color: '#059669' },
};
const ENTITY_ICON: Record<string, React.ElementType> = { transfer: ArrowLeftRight, employee: Users, access: ShieldCheck };

type Kind = 'all' | 'deals' | 'payments' | 'finance' | 'staff';
const KIND_LABEL: Record<Kind, string> = { all: 'Все', deals: 'Сделки', payments: 'Оплаты', finance: 'Финансы', staff: 'Сотрудники и доступ' };
const kindOf = (e: string): Kind => e === 'deal' ? 'deals' : e === 'payment' ? 'payments' : ['income', 'expense', 'transfer'].includes(e) ? 'finance' : 'staff';

/** «Активность сотрудников»: кто на сайте, сколько работал и что делал. */
export default function ActivityPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [who, setWho] = useState<string>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400000);
    const [p, pr, lg] = await Promise.all([
      supabase.from('profiles').select('id, name, role, email, avatar_url'),
      supabase.from('user_presence').select('*').gte('day', kzDay(since)),
      supabase.from('activity_log').select('*').gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(2000),
    ]);
    setPeople((p.data as Person[]) ?? []);
    setPresence((pr.data as Presence[]) ?? []);
    setLog((lg.data as LogRow[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const today = kzDay();
  const nameOf = (p: Person) => (p.name && p.name !== 'admin' ? p.name : p.email?.split('@')[0] ?? 'Сотрудник');
  const personById = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);

  // Сводка по каждому сотруднику на сегодня
  const cards = useMemo(() => people.map(p => {
    const mine = presence.filter(x => x.user_id === p.id);
    const t = mine.find(x => x.day === today);
    const last = mine.reduce<string | null>((a, x) => (!a || x.last_seen > a ? x.last_seen : a), null);
    const actionsToday = log.filter(l => l.user_id === p.id && kzDay(new Date(l.created_at)) === today).length;
    const week = mine.filter(x => x.day > kzDay(new Date(Date.now() - 7 * 86400000))).reduce((s, x) => s + x.active_seconds, 0);
    const online = !!last && Date.now() - new Date(last).getTime() < 180_000;
    return { p, t, last, actionsToday, week, online };
  }).sort((a, b) => Number(b.online) - Number(a.online) || (b.last ?? '').localeCompare(a.last ?? '')), [people, presence, log, today]);

  // Таблица «часы на сайте» за 7 дней
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => kzDay(new Date(Date.now() - (6 - i) * 86400000))), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxSec = Math.max(1, ...presence.filter(x => weekDays.includes(x.day)).map(x => x.active_seconds));

  const visibleLog = useMemo(() => {
    const from = days === 1 ? today : kzDay(new Date(Date.now() - (days - 1) * 86400000));
    return log.filter(l => (who === 'all' || l.user_id === who) && (kind === 'all' || kindOf(l.entity) === kind) && kzDay(new Date(l.created_at)) >= from);
  }, [log, who, kind, days, today]);
  const grouped = useMemo(() => {
    const m = new Map<string, LogRow[]>();
    for (const l of visibleLog) { const d = kzDay(new Date(l.created_at)); m.set(d, [...(m.get(d) ?? []), l]); }
    return [...m.entries()];
  }, [visibleLog]);

  async function openEntity(l: LogRow) {
    if (!l.entity_id || !['deal', 'payment'].includes(l.entity) || l.action === 'delete' && l.entity === 'deal') return;
    const d = await getDealById(l.entity_id).catch(() => null);
    if (d) setEditDeal(d); else toast.error('Сделка не найдена — возможно, удалена');
  }

  const dayTitle = (d: string) => d === today ? 'Сегодня' : d === kzDay(new Date(Date.now() - 86400000)) ? 'Вчера'
    : new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Activity size={20} />Активность сотрудников</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Кто на сайте, сколько времени работал и что делал. Время считается, только пока вкладка открыта и человек работает.</p>
          </div>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />Обновить</Button>
        </div>

        {/* Сотрудники сегодня */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ p, t, last, actionsToday, week, online }) => (
            <button key={p.id} type="button" onClick={() => setWho(w => w === p.id ? 'all' : p.id)}
              className={`text-left rounded-2xl border bg-card p-4 transition-all hover:shadow-sm ${who === p.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <UserAvatar name={nameOf(p)} url={p.avatar_url} size={40} />
                  <span className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full ring-2 ring-card ${online ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{nameOf(p)}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{ROLE_LABELS[p.role] ?? p.role}</div>
                </div>
                <span className={`text-[11px] shrink-0 ${online ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                  {last ? ago(last) : 'ещё не заходил(а)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="rounded-lg bg-muted/50 py-1.5">
                  <div className="text-[10px] text-muted-foreground">Пришёл(а)</div>
                  <div className="text-sm font-semibold tabular-nums">{t ? hm(t.first_seen) : '—'}</div>
                </div>
                <div className="rounded-lg bg-muted/50 py-1.5">
                  <div className="text-[10px] text-muted-foreground">На сайте сегодня</div>
                  <div className="text-sm font-semibold tabular-nums">{t ? dur(t.active_seconds) : '—'}</div>
                </div>
                <div className="rounded-lg bg-muted/50 py-1.5">
                  <div className="text-[10px] text-muted-foreground">Действий</div>
                  <div className="text-sm font-semibold tabular-nums">{actionsToday}</div>
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
                <span>{online && t?.last_page ? <>сейчас: <b className="font-medium text-foreground">{pageLabel(t.last_page)}</b></> : t ? `последний раз: ${hm(t.last_seen)}` : ''}</span>
                <span>за 7 дней: {dur(week)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Часы на сайте за неделю */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><Clock size={15} />Время на сайте за 7 дней</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-[11px] text-muted-foreground">
                  <th className="text-left font-medium px-4 py-1.5">Сотрудник</th>
                  {weekDays.map(d => <th key={d} className="font-medium px-1 py-1.5 capitalize">{new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}</th>)}
                  <th className="text-right font-medium px-4 py-1.5">Итого</th>
                </tr>
              </thead>
              <tbody>
                {people.map(p => {
                  const row = weekDays.map(d => presence.find(x => x.user_id === p.id && x.day === d));
                  const total = row.reduce((s, x) => s + (x?.active_seconds ?? 0), 0);
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-1.5 whitespace-nowrap">{nameOf(p)}</td>
                      {row.map((x, i) => {
                        const k = x ? Math.max(0.12, x.active_seconds / maxSec) : 0;
                        return (
                          <td key={i} className="px-1 py-1.5">
                            <div className="h-8 rounded-md flex items-center justify-center text-[11px] tabular-nums"
                              title={x ? `${hm(x.first_seen)}–${hm(x.last_seen)}, активно ${dur(x.active_seconds)}` : 'не заходил(а)'}
                              style={{ background: x ? `rgba(47,107,87,${k * 0.85})` : 'transparent', color: k > 0.55 ? 'white' : undefined, border: x ? 'none' : '1px dashed hsl(var(--border))' }}>
                              {x ? (x.active_seconds >= 3600 ? `${(x.active_seconds / 3600).toFixed(1)} ч` : `${Math.round(x.active_seconds / 60)} м`) : ''}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-1.5 text-right whitespace-nowrap font-medium tabular-nums">{dur(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Журнал действий */}
        <Card>
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-sm font-medium">Журнал действий {who !== 'all' && personById.get(who) ? `— ${nameOf(personById.get(who)!)}` : ''}</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABEL) as Kind[]).map(k => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`h-7 px-2.5 rounded-full text-xs border ${kind === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>{KIND_LABEL[k]}</button>
              ))}
              <span className="w-px bg-border mx-1" />
              {([[1, 'Сегодня'], [7, '7 дней'], [30, '30 дней']] as const).map(([d, l]) => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  className={`h-7 px-2.5 rounded-full text-xs border ${days === d ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted/50'}`}>{l}</button>
              ))}
              {who !== 'all' && <button type="button" onClick={() => setWho('all')} className="h-7 px-2.5 rounded-full text-xs border border-border hover:bg-muted/50">Все сотрудники ✕</button>}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {visibleLog.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">
                {log.length === 0 ? 'Журнал начал вестись только что — действия сотрудников будут появляться здесь.' : 'За этот период действий нет'}
              </p>
            ) : grouped.map(([d, rows]) => (
              <div key={d}>
                <div className="px-5 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/40 capitalize">{dayTitle(d)} · {rows.length}</div>
                <div className="divide-y divide-border">
                  {rows.map(l => {
                    const a = ACTION_ICON[l.action] ?? ACTION_ICON.update;
                    const I = ENTITY_ICON[l.entity] ?? a.icon;
                    const p = l.user_id ? personById.get(l.user_id) : undefined;
                    const clickable = !!l.entity_id && (l.entity === 'payment' || (l.entity === 'deal' && l.action !== 'delete'));
                    return (
                      <div key={l.id} onClick={clickable ? () => openEntity(l) : undefined}
                        className={`flex items-start gap-3 px-5 py-2.5 ${clickable ? 'cursor-pointer hover:bg-muted/30' : ''}`}>
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${a.color}1a`, color: a.color }}><I size={14} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm"><b className="font-medium">{p ? nameOf(p) : (l.user_name ?? 'Сотрудник')}</b> · {l.title}</div>
                          {l.details && <div className="text-xs text-muted-foreground break-words">{l.entity === 'access' ? prettyAccess(l.details) : l.details}</div>}
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{hm(l.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><LogIn size={11} />Журнал и учёт времени ведутся с 18 октября 2026 г. Видят только директора.</p>
      </div>

      {editDeal && (
        <DealFormDialog open={!!editDeal} deal={editDeal} managerId={editDeal.manager_id} monthYear={editDeal.month_year}
          onClose={() => setEditDeal(null)} onSaved={() => { setEditDeal(null); load(); }} />
      )}
    </AppLayout>
  );
}
