import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout, { navItems } from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { countPendingDeals, countUnreadNotifications, getDeals } from '@/lib/api';
import { formatCurrency, getCurrentMonthYear } from '@/lib/utils';
import { Sunrise, Sun, Sunset, Moon, ArrowRight, TrendingUp, CheckSquare, HandCoins, Bell, ClipboardList } from 'lucide-react';

// Приветствие по времени суток (Шымкент)
function greeting(h: number) {
  if (h >= 5 && h < 12) return { text: 'Доброе утро', Icon: Sunrise };
  if (h >= 12 && h < 18) return { text: 'Добрый день', Icon: Sun };
  if (h >= 18 && h < 23) return { text: 'Добрый вечер', Icon: Sunset };
  return { text: 'Доброй ночи', Icon: Moon };
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

interface Summary {
  revenue: number | null;
  dealsCount: number | null;
  pending: number | null;
  overdueCount: number | null;
  overdueSum: number | null;
  unread: number | null;
  lastReport: { report_date: string; leads: number; calls: number; chats: number } | null;
}

/** Приветственная страница — открывается по нажатию на «A-Finance». */
export default function WelcomePage() {
  const { profile, isAdmin, canView, canViewAllManagers, canApprove } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [s, setS] = useState<Summary>({ revenue: null, dealsCount: null, pending: null, overdueCount: null, overdueSum: null, unread: null, lastReport: null });

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const month = getCurrentMonthYear();
    const today = new Date().toISOString().slice(0, 10);
    const managerFilter = canViewAllManagers ? null : (profile?.manager_id ?? null);

    // Выручка за месяц: директор/РОП — по всем подтверждённым сделкам, менеджер — свои
    (async () => {
      try {
        let list: { total_amount: number; paid_amount: number; next_payment_date: string | null; status: string }[] = [];
        if (canViewAllManagers) {
          const { data } = await supabase.from('deals').select('total_amount, paid_amount, next_payment_date, status').eq('month_year', month).eq('status', 'approved');
          list = (data as typeof list) ?? [];
        } else if (profile?.manager_id) {
          list = (await getDeals(profile.manager_id, month)).filter(d => d.status === 'approved');
        }
        setS(p => ({ ...p, revenue: list.reduce((a, d) => a + Number(d.total_amount), 0), dealsCount: list.length }));
      } catch { /* silent */ }
    })();

    // Просроченные доплаты (по всем месяцам)
    (async () => {
      try {
        let q = supabase.from('deals').select('total_amount, paid_amount').eq('status', 'approved').lt('next_payment_date', today);
        if (!canViewAllManagers && profile?.manager_id) q = q.eq('manager_id', profile.manager_id);
        const { data } = await q;
        const rows = ((data as { total_amount: number; paid_amount: number }[]) ?? []).filter(d => Number(d.total_amount) > Number(d.paid_amount));
        setS(p => ({ ...p, overdueCount: rows.length, overdueSum: rows.reduce((a, d) => a + Number(d.total_amount) - Number(d.paid_amount), 0) }));
      } catch { /* silent */ }
    })();

    if (canApprove) countPendingDeals().then(n => setS(p => ({ ...p, pending: n }))).catch(() => {});
    countUnreadNotifications(managerFilter).then(n => setS(p => ({ ...p, unread: n }))).catch(() => {});

    if (canViewAllManagers) {
      supabase.from('amo_daily_reports').select('report_date, leads, calls_in, calls_out, chats').order('report_date', { ascending: false }).limit(1)
        .then(({ data }) => {
          const r = data?.[0] as { report_date: string; leads: number; calls_in: number; calls_out: number; chats: number } | undefined;
          if (r) setS(p => ({ ...p, lastReport: { report_date: r.report_date, leads: r.leads, calls: r.calls_in + r.calls_out, chats: r.chats } }));
        });
    }
  }, [canViewAllManagers, canApprove, profile?.manager_id]);

  const name = (profile?.name && !profile.name.includes('@') && profile.name !== 'admin') ? profile.name.split(' ')[0] : '';
  const { text, Icon } = greeting(now.getHours());
  const rawDate = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const timeLabel = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const monthLabel = now.toLocaleDateString('ru-RU', { month: 'long' });

  const sections = navItems.filter(i => isAdmin || canView(i.pageKey));
  const allowed = (key: string) => isAdmin || canView(key);

  const tiles: { to: string; key: string; icon: React.ElementType; label: string; value: string; hint?: string; tone?: 'warn' | 'bad' }[] = [];
  tiles.push({ to: '/sales', key: 'sales', icon: TrendingUp, label: `Продажи за ${monthLabel}`, value: s.revenue == null ? '…' : formatCurrency(s.revenue), hint: s.dealsCount == null ? undefined : `подтверждено ${s.dealsCount} ${plural(s.dealsCount, 'сделка', 'сделки', 'сделок')}` });
  if (canApprove) tiles.push({ to: '/approvals', key: 'approvals', icon: CheckSquare, label: 'Ждут подтверждения', value: s.pending == null ? '…' : String(s.pending), tone: s.pending ? 'warn' : undefined });
  tiles.push({ to: '/debtors', key: 'debtors', icon: HandCoins, label: 'Просрочены доплаты', value: s.overdueCount == null ? '…' : String(s.overdueCount), hint: s.overdueSum ? `на ${formatCurrency(s.overdueSum)}` : undefined, tone: s.overdueCount ? 'bad' : undefined });
  tiles.push({ to: '/messages', key: 'messages', icon: Bell, label: 'Новые сообщения', value: s.unread == null ? '…' : String(s.unread), tone: s.unread ? 'warn' : undefined });
  if (s.lastReport) {
    const d = new Date(`${s.lastReport.report_date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    tiles.push({ to: '/daily-report', key: 'daily-report', icon: ClipboardList, label: `Отчёт за ${d}`, value: `${s.lastReport.leads} лидов`, hint: `${s.lastReport.calls} звонков · ${s.lastReport.chats} чатов` });
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Приветствие */}
        <section className="relative overflow-hidden rounded-2xl px-6 py-8 md:px-10 md:py-12 text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1f3d34 0%, #2f5d4f 55%, #8a6a45 130%)' }}>
          <div aria-hidden className="absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 22px)' }} />
          <div aria-hidden className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <Icon size={18} />
              <span>{dateLabel}</span>
              <span className="text-white/50">·</span>
              <span className="tabular-nums">{timeLabel}</span>
            </div>
            <h1 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight">
              {text}{name ? `, ${name}` : ''}!
            </h1>
            <p className="mt-3 text-white/80 max-w-xl text-sm md:text-base">
              Добро пожаловать в A-Finance — продажи, оплаты, производство и отчёты Profildoors в одном месте.
            </p>
            {allowed('dashboard') && (
              <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white text-[#1f3d34] px-5 py-2.5 text-sm font-medium hover:bg-white/90 transition-colors">
                Открыть дашборд <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </section>

        {/* Коротко о сегодняшнем */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Коротко на сегодня</h2>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {tiles.filter(t => allowed(t.key)).map(t => (
              <Link key={t.to} to={t.to}
                className="group rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><t.icon size={14} /><span className="truncate">{t.label}</span></div>
                <div className={`mt-1.5 text-xl font-semibold tabular-nums truncate ${t.tone === 'bad' ? 'text-red-600' : t.tone === 'warn' ? 'text-amber-600' : ''}`}>{t.value}</div>
                {t.hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{t.hint}</div>}
              </Link>
            ))}
          </div>
        </section>

        {/* Быстрый переход по разделам */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Разделы</h2>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {sections.map(item => (
              <Link key={item.path} to={item.path}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 text-sm hover:border-primary/40 hover:bg-muted/40 transition-colors min-w-0">
                <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><item.icon size={16} /></span>
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
