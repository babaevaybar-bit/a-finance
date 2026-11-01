import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, Factory, CheckCheck, Scale, ClipboardList, KanbanSquare, CheckCircle2, ClipboardCheck, Bell, Inbox } from 'lucide-react';
import { dealCompleteness } from '@/components/sales/DealCompleteness';
import { getNotifications, markNotificationRead, markNotificationsRead, getDealById, notifyCountersChanged } from '@/lib/api';
import DealFormDialog from '@/components/sales/DealFormDialog';
import { toast } from 'sonner';
import type { AppNotification, Deal } from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';
import AssignmentsPanel from '@/components/assignments/AssignmentsPanel';
import { waitingCount } from '@/lib/assignments';
import { supabase } from '@/db/supabase';

type Tab = 'tasks' | 'important' | 'production' | 'all';
interface Entry { key: string; day: string; type: string; items: AppNotification[] }
const kzDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qyzylorda' }).format(new Date(iso));
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qyzylorda' });
function dayTitle(d: string) {
  const today = kzDay(new Date().toISOString());
  const yest = kzDay(new Date(Date.now() - 86400000).toISOString());
  if (d === today) return 'Сегодня';
  if (d === yest) return 'Вчера';
  return new Date(`${d}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const lineName = (line: string) => line.replace(/^•\s*/, '').split(' — ')[0].trim();
async function findDealByPrefix(name: string): Promise<Deal | null> {
  const safe = name.replace(/[%_\\]/g, m => `\\${m}`);
  const { data } = await supabase.from('deals').select('*').ilike('client_name', `${safe}%`)
    .neq('status', 'rejected').order('created_at', { ascending: false }).limit(1);
  return (data as Deal[] | null)?.[0] ?? null;
}

export default function MessagesPage() {
  const { profile, canViewAllManagers } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  // Текущие сделки из «Дозаполните сделки» — чтобы показать, что уже исправлено
  const [lineDeals, setLineDeals] = useState<Record<string, Deal>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Директор/РОП видят уведомления всех сотрудников; остальные — только свои
      const list = await getNotifications(canViewAllManagers ? null : (profile?.manager_id ?? null));
      setItems(list);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [profile?.manager_id, canViewAllManagers]);

  useEffect(() => { load(); }, [load]);

  const refreshLineDeals = useCallback(async (list: AppNotification[]) => {
    const names = [...new Set(list.filter(n => n.type === 'incomplete_deals')
      .flatMap(n => (n.body ?? '').split('\n').filter(l => l.startsWith('•')).map(lineName)).filter(Boolean))];
    if (!names.length) { setLineDeals({}); return; }
    const map: Record<string, Deal> = {};
    for (let i = 0; i < names.length; i += 100) {
      const { data } = await supabase.from('deals').select('*').in('client_name', names.slice(i, i + 100))
        .neq('status', 'rejected').order('created_at', { ascending: true });
      for (const d of (data as Deal[] | null) ?? []) if (d.client_name) map[d.client_name] = d;   // самая новая сделка с этим именем
    }
    // клиента потом переименовали («Перизат» → «Перизат Тулпар») — ищем по началу имени
    for (const n of names.filter(x => !map[x])) {
      const d = await findDealByPrefix(n);
      if (d) map[n] = d;
    }
    setLineDeals(map);
  }, []);
  useEffect(() => { refreshLineDeals(items).catch(() => {}); }, [items, refreshLineDeals]);

  /** Что из перечисленного в строке ещё не заполнено; null — сделка не найдена */
  function lineStatus(line: string): string[] | null {
    const d = lineDeals[lineName(line)];
    if (!d) return null;
    const missing = dealCompleteness(d).missing;
    const asked = (line.split(' — ')[1] ?? '').split(',').map(x => x.trim()).filter(Boolean);
    return asked.filter(f => missing.includes(f) || (f === 'сумма' && missing.includes('сумма сделки')));
  }

  async function handleOpen(n: AppNotification) {
    if (!n.is_read) {
      setItems(prev => prev.map(i => i.id === n.id ? { ...i, is_read: true } : i));
      markNotificationRead(n.id).then(notifyCountersChanged).catch(() => {});
    }
    // Сделка → открываем её прямо здесь; этап производства → карточку на доске
    if (n.deal_id) {
      try {
        const d = await getDealById(n.deal_id);
        if (d) { setEditDeal(d); return; }
        toast.error('Сделка не найдена — возможно, удалена');
      } catch { toast.error('Не удалось открыть сделку'); }
      return;
    }
    if (n.type === 'incomplete_deals') { navigate('/sales'); return; }
    if (n.link) { navigate(n.link); return; }
    if (n.trello_card_id) navigate(`/production?card=${n.trello_card_id}`);
    else navigate('/production');
  }

  // «• Гульмира 4you — адрес» → открыть эту сделку (в сообщении нет id — ищем по имени клиента)
  async function openDealByLine(line: string) {
    const name = lineName(line);
    if (!name) { navigate('/sales'); return; }
    try {
      const { data } = await supabase.from('deals').select('*').eq('client_name', name)
        .neq('status', 'rejected').order('created_at', { ascending: false }).limit(1);
      const d = (data as Deal[] | null)?.[0] ?? lineDeals[name] ?? await findDealByPrefix(name);
      if (d) { setEditDeal(d); return; }
      toast.error(`Сделка «${name}» не найдена — возможно, переименована или удалена`);
    } catch { toast.error('Не удалось открыть сделку'); }
  }

  async function handleMarkAllRead() {
    const ids = items.filter(i => !i.is_read).map(i => i.id);
    if (!ids.length) return;
    const before = items;
    setItems(prev => prev.map(i => ({ ...i, is_read: true })));
    try {
      await markNotificationsRead(ids);
      notifyCountersChanged();
    } catch {
      setItems(before);
      toast.error('Не удалось отметить сообщения прочитанными');
    }
  }

  const unreadCount = items.filter(i => !i.is_read).length;
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'tasks' ? 'tasks' : 'important');
  // поручения, которые ждут моего действия: сделать или проверить
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    const upd = () => waitingCount().then(n => { setWaiting(n); }).catch(() => {});
    upd(); window.addEventListener('afin:counters', upd);
    return () => window.removeEventListener('afin:counters', upd);
  }, []);
  const autoTab = useRef(false);
  useEffect(() => { if (!autoTab.current && waiting > 0 && !params.get('tab')) { autoTab.current = true; setTab('tasks'); } }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const [expanded, setExpanded] = useState<string | null>(null);

  // Склеиваем однотипные сообщения, чтобы не было «простыни»:
  //  • «Дозаполните сделки» за день — одна карточка со всеми сделками;
  //  • смены этапа одного заказа за день — одна цепочка «А → Б → В».
  const entries = useMemo(() => {
    const map = new Map<string, Entry>();
    const order: string[] = [];
    for (const n of items) {
      const day = kzDay(n.created_at);
      // «Дозаполните сделки» — одно живое сообщение на сотрудника (самое свежее), без повторов по дням
      const key = n.type === 'incomplete_deals' ? `inc|${n.manager_id}`
        : n.type === 'stage_changed' ? `st|${day}|${n.title}` : `one|${n.id}`;
      if (n.type === 'incomplete_deals' && map.has(key)) continue;
      let e = map.get(key);
      if (!e) { e = { key, day, type: n.type, items: [] }; map.set(key, e); order.push(key); }
      e.items.push(n);
    }
    return order.map(k => map.get(k)!);
  }, [items]);
  const isImportant = (t: string) => t !== 'stage_changed';
  const visible = entries.filter(e => tab === 'all' || (tab === 'important' ? isImportant(e.type) : !isImportant(e.type)));
  const unreadEntries = entries.filter(e => e.items.some(i => !i.is_read)).length;
  const unreadIn = (pred: (t: string) => boolean) => entries.filter(e => pred(e.type) && e.items.some(i => !i.is_read)).length;

  async function openEntry(e: Entry) {
    const unread = e.items.filter(i => !i.is_read).map(i => i.id);
    if (unread.length) {
      setItems(prev => prev.map(i => unread.includes(i.id) ? { ...i, is_read: true } : i));
      markNotificationsRead(unread).then(notifyCountersChanged).catch(() => {});
    }
    if (e.type === 'incomplete_deals') {
      const deals = [...new Set(e.items.flatMap(i => (i.body ?? '').split('\n').filter(l => l.startsWith('•'))))];
      if (deals.length === 1) { await openDealByLine(deals[0]); return; }
      setExpanded(x => x === e.key ? null : e.key); return;
    }
    const first = e.items[0];
    await handleOpen({ ...first, is_read: true });
  }

  // «Дозаполните сделки»: горит наверху, пока есть что исправить; всё исправлено — исчезает
  const allFixed = (e: Entry) => {
    const ls = [...new Set(e.items.flatMap(i => (i.body ?? '').split('\n').filter(l => l.startsWith('•'))))];
    return ls.length > 0 && ls.every(l => { const x = lineStatus(l); return x !== null && x.length === 0; });
  };
  const list = [
    ...visible.filter(e => e.type === 'incomplete_deals' && !allFixed(e)),
    ...visible.filter(e => e.type !== 'incomplete_deals'),
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Сообщения</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Поручения, оплаты, расхождения сумм и этапы производства{unreadEntries > 0 ? ` · ${unreadEntries} новых` : ''}
            </p>
          </div>
          {unreadCount > 0 && tab !== 'tasks' && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck size={14} className="mr-1.5" />Прочитать всё
            </Button>
          )}
        </div>

        {/* Слева — содержимое раздела, справа — разделы (на телефоне — вкладки сверху) */}
        <div className="flex flex-col-reverse lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full">
        {tab === 'tasks' ? <AssignmentsPanel /> : loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{items.length === 0 ? 'Пока нет сообщений' : 'Здесь пусто 👌'}</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {list.map((e, idx) => {
              const n = e.items[0];
              const unread = e.items.some(i => !i.is_read);
              const Icon = n.type === 'payment_due' ? Banknote : n.type === 'amount_mismatch' ? Scale : n.type === 'incomplete_deals' ? ClipboardList : n.type === 'card_due' ? KanbanSquare : Factory;
              const iconColor = n.type === 'payment_due' || n.type === 'incomplete_deals' || n.type === 'card_due' ? 'text-amber-600' : n.type === 'amount_mismatch' ? 'text-destructive' : 'text-primary';
              let title = n.title;
              let lines: string[] = (n.body ?? '').split('\n').filter(Boolean);
              if (e.type === 'incomplete_deals') {
                const all = [...new Set(e.items.flatMap(i => (i.body ?? '').split('\n').filter(l => l.startsWith('•'))))];
                title = `Дозаполните сделки (${all.length})`;
                lines = all;
              } else if (e.type === 'stage_changed' && e.items.length > 1) {
                const chain = [...e.items].reverse().map(i => (i.body ?? '').split(' → '));
                lines = [[chain[0][0], ...chain.map(c => c[1] ?? '')].join(' → ')];
              }
              const isOpen = expanded === e.key;
              const shown = e.type === 'incomplete_deals' && !isOpen ? lines.slice(0, 4) : lines;
              const showDay = e.type !== 'incomplete_deals' && (idx === 0 || list[idx - 1].day !== e.day || list[idx - 1].type === 'incomplete_deals');
              const pinHead = e.type === 'incomplete_deals' && idx === 0;
              return (
                <React.Fragment key={e.key}>
                  {pinHead && <div className="text-[11px] font-medium text-amber-700 pt-0">Нужно исправить — сообщение горит, пока не исправите</div>}
                  {showDay && <div className="text-[11px] font-medium text-muted-foreground pt-2 first:pt-0">{dayTitle(e.day)}</div>}
                  <Card className={`cursor-pointer transition-colors hover:border-primary/40 ${unread ? 'border-primary/40' : ''}`} onClick={() => openEntry(e)}>
                    <CardContent className="py-3 px-4 flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${unread ? 'bg-primary/10' : 'bg-muted'}`}>
                        <Icon size={15} className={iconColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>{title}</p>
                          {unread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                          {e.type === 'incomplete_deals' && lines.length > 0 && lines.every(l => { const x = lineStatus(l); return x !== null && x.length === 0; }) && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"><CheckCircle2 size={12} />всё исправлено</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                          {shown.map((l, i) => {
                            if (!(e.type === 'incomplete_deals' && l.startsWith('•'))) return <div key={i} className="break-words">{l}</div>;
                            const left = lineStatus(l);
                            const fixed = left !== null && left.length === 0;
                            return (
                              <button key={i} type="button" onClick={ev => { ev.stopPropagation(); openDealByLine(l); }}
                                className={`flex items-start gap-1.5 text-left break-words hover:underline ${fixed ? 'text-green-700' : 'hover:text-primary'}`}>
                                {fixed
                                  ? <CheckCircle2 size={13} className="mt-[1px] shrink-0 text-green-600" />
                                  : <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                                <span>
                                  {lineName(l)} — {fixed ? <span>исправлено</span> : left && left.length ? <span>осталось: {left.join(', ')}</span> : (l.split(' — ')[1] ?? '')}
                                </span>
                              </button>
                            );
                          })}
                          {e.type === 'incomplete_deals' && lines.length > 4 && (
                            <div className="text-primary">{isOpen ? 'Свернуть' : `Показать ещё ${lines.length - 4}`}</div>
                          )}
                        </div>
                        {e.type === 'incomplete_deals' && isOpen && (
                          <button type="button" className="mt-1.5 text-xs text-primary hover:underline" onClick={ev => { ev.stopPropagation(); navigate('/sales'); }}>Открыть «Продажи» →</button>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{hm(e.items[0].created_at)}</span>
                    </CardContent>
                  </Card>
                </React.Fragment>
              );
            })}
          </div>
        )}
        </div>
        <aside className="w-full lg:w-64 shrink-0 lg:sticky lg:top-4">
          <nav className="tabs-scroll flex lg:flex-col gap-1.5 lg:gap-1 overflow-x-auto lg:overflow-visible rounded-xl lg:border lg:bg-card lg:p-1.5">
            {([
              ['tasks', 'Поручения', waiting, ClipboardCheck, 'задания сотрудникам'],
              ['important', 'Важное', unreadIn(isImportant), Bell, 'оплаты, суммы, сделки'],
              ['production', 'Производство', unreadIn(t => !isImportant(t)), Factory, 'этапы заказов'],
              ['all', 'Все', 0, Inbox, 'вся лента'],
            ] as const).map(([k, l, c, Icon, sub]) => (
              <button key={k} type="button" onClick={() => setTab(k as Tab)}
                className={`shrink-0 lg:w-full text-left rounded-lg px-3 py-2 lg:py-2.5 inline-flex items-center gap-2.5 border lg:border-0 transition-colors ${tab === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-background lg:bg-transparent hover:bg-muted/60'}`}>
                <Icon size={16} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight">{l}</span>
                  <span className={`hidden lg:block text-[11px] leading-tight ${tab === k ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>{sub}</span>
                </span>
                {c > 0 && <span className={`text-[10px] min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center font-semibold ${tab === k ? 'bg-white/25' : 'bg-destructive text-destructive-foreground'}`}>{c}</span>}
              </button>
            ))}
          </nav>
        </aside>
        </div>
      </div>
      {editDeal && (
        <DealFormDialog
          open={!!editDeal}
          deal={editDeal}
          managerId={editDeal.manager_id}
          monthYear={editDeal.month_year}
          onClose={() => setEditDeal(null)}
          onSaved={() => { setEditDeal(null); refreshLineDeals(items).catch(() => {}); }}
        />
      )}
    </AppLayout>
  );
}
