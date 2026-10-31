import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, Factory, CheckCheck, Scale, ClipboardList, KanbanSquare } from 'lucide-react';
import { getNotifications, markNotificationRead, markNotificationsRead, getDealById, notifyCountersChanged } from '@/lib/api';
import DealFormDialog from '@/components/sales/DealFormDialog';
import { toast } from 'sonner';
import type { AppNotification, Deal } from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';

type Tab = 'important' | 'production' | 'all';
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

export default function MessagesPage() {
  const { profile, canViewAllManagers } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);

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
    const name = line.replace(/^•\s*/, '').split(' — ')[0].trim();
    if (!name) { navigate('/sales'); return; }
    try {
      const { data } = await supabase.from('deals').select('*').eq('client_name', name)
        .neq('status', 'rejected').order('created_at', { ascending: false }).limit(1);
      const d = (data as Deal[] | null)?.[0];
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
  const [tab, setTab] = useState<Tab>('important');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Склеиваем однотипные сообщения, чтобы не было «простыни»:
  //  • «Дозаполните сделки» за день — одна карточка со всеми сделками;
  //  • смены этапа одного заказа за день — одна цепочка «А → Б → В».
  const entries = useMemo(() => {
    const map = new Map<string, Entry>();
    const order: string[] = [];
    for (const n of items) {
      const day = kzDay(n.created_at);
      const key = n.type === 'incomplete_deals' ? `inc|${day}`
        : n.type === 'stage_changed' ? `st|${day}|${n.title}` : `one|${n.id}`;
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

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Сообщения</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Оплаты, расхождения сумм и этапы производства{unreadEntries > 0 ? ` · ${unreadEntries} новых` : ''}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck size={14} className="mr-1.5" />Прочитать всё
            </Button>
          )}
        </div>

        <div className="flex gap-1.5">
          {([['important', 'Важное', unreadIn(isImportant)], ['production', 'Производство', unreadIn(t => !isImportant(t))], ['all', 'Все', 0]] as const).map(([k, l, c]) => (
            <button key={k} type="button" onClick={() => setTab(k as Tab)}
              className={`h-8 px-3 rounded-full text-sm border inline-flex items-center gap-1.5 ${tab === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>
              {l}{c > 0 && <span className={`text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center ${tab === k ? 'bg-white/25' : 'bg-destructive text-destructive-foreground'}`}>{c}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{items.length === 0 ? 'Пока нет сообщений' : 'Здесь пусто 👌'}</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {visible.map((e, idx) => {
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
              const showDay = idx === 0 || visible[idx - 1].day !== e.day;
              return (
                <React.Fragment key={e.key}>
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
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                          {shown.map((l, i) => e.type === 'incomplete_deals' && l.startsWith('•')
                            ? <button key={i} type="button" className="block text-left break-words hover:text-primary hover:underline"
                                onClick={ev => { ev.stopPropagation(); openDealByLine(l); }}>{l}</button>
                            : <div key={i} className="break-words">{l}</div>)}
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
      {editDeal && (
        <DealFormDialog
          open={!!editDeal}
          deal={editDeal}
          managerId={editDeal.manager_id}
          monthYear={editDeal.month_year}
          onClose={() => setEditDeal(null)}
          onSaved={() => setEditDeal(null)}
        />
      )}
    </AppLayout>
  );
}
