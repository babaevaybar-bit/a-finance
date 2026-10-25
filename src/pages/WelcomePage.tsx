import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout, { navItems } from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { countPendingDeals, countUnreadNotifications, getDeals } from '@/lib/api';
import { formatCurrency, getCurrentMonthYear } from '@/lib/utils';
import { waitingForWarehouse } from '@/lib/payments';
import OfflineLeadsCard from '@/components/leads/OfflineLeads';
import { Sunrise, Sun, Sunset, Moon, ArrowRight, ArrowUpRight, TrendingUp, CheckSquare, HandCoins, Bell, ClipboardList, Sparkles } from 'lucide-react';
import '@fontsource/petit-formal-script/latin-400.css';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

// ── helpers ──────────────────────────────────────────────────────────────────
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
const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`;

// Плавный «набег» числа
function useCountUp(target: number | null, ms = 1100) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null) return;
    const start = performance.now(); const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const val = a + (target - a) * e;
      setV(val);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

interface Summary {
  revenue: number | null; plan: number | null; dealsCount: number | null;
  pending: number | null; overdueCount: number | null; overdueSum: number | null; unread: number | null;
  reports: { report_date: string; leads: number; calls: number; chats: number }[] | null;
}

// ── Надпись «A-Finance for ProfilDoors», которая пишется пером при открытии ──
function SignatureLogo() {
  return (
    <svg viewBox="0 0 520 230" className="w-[300px] md:w-[440px] h-auto overflow-visible" role="img" aria-label="A-Finance for ProfilDoors">
      <defs>
        <linearGradient id="wlInk" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#fde7b0" /><stop offset="55%" stopColor="#f7f3ea" /><stop offset="100%" stopColor="#a7e3c6" />
        </linearGradient>
      </defs>
      <text x="260" y="118" textAnchor="middle" className="wl-sign wl-sign-1"
        style={{ fontFamily: "'Petit Formal Script', cursive", fontSize: 88 }}>A-Finance</text>
      <path d="M110 148 C 200 136, 330 134, 430 144" className="wl-flourish" fill="none" stroke="url(#wlInk)" strokeWidth="2" strokeLinecap="round" />
      <text x="260" y="205" textAnchor="middle" className="wl-sign wl-sign-2"
        style={{ fontFamily: "'Petit Formal Script', cursive", fontSize: 40 }}>for ProfilDoors</text>
    </svg>
  );
}

// Кольцо выполнения плана
function PlanRing({ pct }: { pct: number }) {
  const r = 42, c = 2 * Math.PI * r;
  const shown = useCountUp(pct, 1400);
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="url(#wlRing)" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, shown) / 100)} />
      <defs>
        <linearGradient id="wlRing" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f6c56f" /><stop offset="100%" stopColor="#7fd1a8" />
        </linearGradient>
      </defs>
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="rotate-90 origin-center fill-white font-semibold" fontSize="20">
        {Math.round(shown)}%
      </text>
    </svg>
  );
}

/** Приветственная страница — открывается по нажатию на «A-Finance». */
export default function WelcomePage() {
  const { profile, isAdmin, canView, canViewAllManagers, canApprove } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [s, setS] = useState<Summary>({ revenue: null, plan: null, dealsCount: null, pending: null, overdueCount: null, overdueSum: null, unread: null, reports: null });

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const month = getCurrentMonthYear();
    const today = new Date().toISOString().slice(0, 10);
    const managerFilter = canViewAllManagers ? null : (profile?.manager_id ?? null);

    (async () => {
      try {
        let list: { total_amount: number; status: string }[] = [];
        let planQ = supabase.from('sales_plans').select('plan_amount, manager_id').eq('month_year', month);
        if (canViewAllManagers) {
          const { data } = await supabase.from('deals').select('total_amount, status').eq('month_year', month).eq('status', 'approved');
          list = (data as typeof list) ?? [];
        } else if (profile?.manager_id) {
          list = (await getDeals(profile.manager_id, month)).filter(d => d.status === 'approved');
          planQ = planQ.eq('manager_id', profile.manager_id);
        }
        const { data: plans } = await planQ;
        const plan = ((plans as { plan_amount: number }[]) ?? []).reduce((a, p) => a + Number(p.plan_amount || 0), 0);
        setS(p => ({ ...p, revenue: list.reduce((a, d) => a + Number(d.total_amount), 0), dealsCount: list.length, plan }));
      } catch { /* silent */ }
    })();

    (async () => {
      try {
        let q = supabase.from('deals').select('total_amount, paid_amount, production_stage').eq('status', 'approved').lt('next_payment_date', today);
        if (!canViewAllManagers && profile?.manager_id) q = q.eq('manager_id', profile.manager_id);
        const { data } = await q;
        const rows = ((data as { total_amount: number; paid_amount: number; production_stage: string | null }[]) ?? []).filter(d => Number(d.total_amount) > Number(d.paid_amount) && !waitingForWarehouse(d));
        setS(p => ({ ...p, overdueCount: rows.length, overdueSum: rows.reduce((a, d) => a + Number(d.total_amount) - Number(d.paid_amount), 0) }));
      } catch { /* silent */ }
    })();

    if (canApprove) countPendingDeals().then(n => setS(p => ({ ...p, pending: n }))).catch(() => {});
    countUnreadNotifications(managerFilter).then(n => setS(p => ({ ...p, unread: n }))).catch(() => {});

    if (canViewAllManagers) {
      supabase.from('amo_daily_reports').select('report_date, leads, calls_in, calls_out, chats').order('report_date', { ascending: false }).limit(14)
        .then(({ data }) => {
          const rows = ((data ?? []) as { report_date: string; leads: number; calls_in: number; calls_out: number; chats: number }[])
            .map(r => ({ report_date: r.report_date, leads: r.leads, calls: r.calls_in + r.calls_out, chats: r.chats })).reverse();
          setS(p => ({ ...p, reports: rows }));
        });
    }
  }, [canViewAllManagers, canApprove, profile?.manager_id]);

  const name = (profile?.name && !profile.name.includes('@') && profile.name !== 'admin') ? profile.name.split(' ')[0] : '';
  const { text, Icon } = greeting(now.getHours());
  const rawDate = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const timeLabel = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const monthLabel = now.toLocaleDateString('ru-RU', { month: 'long' });
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();

  const revenueAnim = useCountUp(s.revenue);
  const pct = s.plan && s.revenue != null ? (s.revenue / s.plan) * 100 : 0;
  const missing = s.plan && s.revenue != null ? Math.max(0, s.plan - s.revenue) : 0;

  const allowed = (key: string) => isAdmin || canView(key);
  const sections = navItems.filter(i => allowed(i.pageKey));
  const last = s.reports && s.reports.length ? s.reports[s.reports.length - 1] : null;

  const tiles: { to: string; page: string; icon: React.ElementType; label: string; value: number | null; fmt?: (n: number) => string; hint?: string; color: string }[] = [];
  if (canApprove) tiles.push({ to: '/approvals', page: 'approvals', icon: CheckSquare, label: 'Ждут подтверждения', value: s.pending, color: '#d97706' });
  tiles.push({ to: '/debtors', page: 'debtors', icon: HandCoins, label: 'Просрочены доплаты', value: s.overdueCount, hint: s.overdueSum ? `на ${money(s.overdueSum)}` : 'всё вовремя', color: '#dc2626' });
  tiles.push({ to: '/messages', page: 'messages', icon: Bell, label: 'Новые сообщения', value: s.unread, color: '#2563eb' });
  if (last) {
    const d = new Date(`${last.report_date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    tiles.push({ to: '/daily-report', page: 'daily-report', icon: ClipboardList, label: `Лиды за ${d}`, value: last.leads, hint: `${last.calls} звонков · ${last.chats} чатов`, color: '#059669' });
  }

  return (
    <AppLayout>
      <style>{`
        @keyframes wlWrite { 0% { stroke-dashoffset: 2600; fill-opacity: 0 } 70% { stroke-dashoffset: 0; fill-opacity: 0 } 100% { stroke-dashoffset: 0; fill-opacity: 1 } }
        @keyframes wlLine { from { stroke-dashoffset: 320 } to { stroke-dashoffset: 0 } }
        @keyframes wlUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @keyframes wlFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        .wl-sign { fill: url(#wlInk); stroke: url(#wlInk); stroke-width: 1.2; stroke-dasharray: 2600; stroke-dashoffset: 2600; fill-opacity: 0; paint-order: stroke }
        .wl-sign-1 { animation: wlWrite 2.8s cubic-bezier(.45,.05,.3,1) .3s forwards }
        .wl-sign-2 { animation: wlWrite 2.2s cubic-bezier(.45,.05,.3,1) 2.4s forwards }
        .wl-flourish { stroke-dasharray: 320; stroke-dashoffset: 320; animation: wlLine 1.2s ease-out 2s forwards; opacity: .7 }
        .wl-up { animation: wlUp .6s cubic-bezier(.2,.7,.2,1) both }
        .wl-float { animation: wlFloat 6s ease-in-out 2.2s infinite }
        @media (prefers-reduced-motion: reduce) { .wl-up,.wl-float,.wl-sign,.wl-flourish { animation: none !important; stroke-dashoffset: 0 !important; fill-opacity: 1 !important } }
      `}</style>

      <div className="max-w-6xl mx-auto space-y-6">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden rounded-3xl text-white shadow-[0_30px_60px_-30px_rgba(10,30,24,.65)]"
          style={{ background: 'radial-gradient(90% 120% at 85% 40%, #2b4a3f 0%, #172b24 45%, #0e1c17 100%)' }}>
          {/* мягкая текстура и световые пятна */}
          <div aria-hidden className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 24px)' }} />
          <div aria-hidden className="absolute -left-24 -bottom-24 w-80 h-80 rounded-full bg-emerald-400/10 blur-3xl" />
          <div aria-hidden className="absolute right-10 top-10 w-72 h-72 rounded-full bg-amber-300/10 blur-3xl" />

          <div className="relative grid md:grid-cols-[1fr_auto] gap-8 px-6 py-8 md:px-12 md:py-12">
            <div className="flex flex-col justify-center min-w-0">
              <div className="wl-up flex flex-wrap items-center gap-2 text-white/70 text-sm" style={{ animationDelay: '.05s' }}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 backdrop-blur"><Icon size={15} />{dateLabel}</span>
                <span className="rounded-full bg-white/10 px-3 py-1 tabular-nums">{timeLabel}</span>
              </div>
              <h1 className="wl-up mt-5 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]" style={{ animationDelay: '.15s' }}>
                {text}{name ? ',' : ''}<br className="hidden md:block" />
                {name && <span className="bg-gradient-to-r from-amber-200 via-amber-100 to-emerald-200 bg-clip-text text-transparent"> {name}</span>}
                {name ? '!' : '!'}
              </h1>

              {/* План месяца */}
              {s.plan != null && s.plan > 0 && allowed('sales') && (
                <Link to="/sales" className="wl-up group mt-7 flex items-center gap-4 rounded-2xl bg-white/[0.07] hover:bg-white/[0.11] ring-1 ring-white/10 p-3 pr-5 max-w-md transition-colors" style={{ animationDelay: '.35s' }}>
                  <PlanRing pct={pct} />
                  <div className="min-w-0">
                    <div className="text-xs text-white/60">План продаж на {monthLabel}</div>
                    <div className="text-xl md:text-2xl font-semibold tabular-nums mt-0.5 whitespace-nowrap">{money(revenueAnim)}</div>
                    <div className="text-xs text-white/60 mt-0.5">
                      {missing > 0 ? <>ещё {money(missing)} · осталось {daysLeft} {plural(daysLeft, 'день', 'дня', 'дней')}</> : <span className="text-emerald-300 inline-flex items-center gap-1"><Sparkles size={12} />план выполнен!</span>}
                    </div>
                  </div>
                  <ArrowUpRight size={18} className="ml-auto text-white/40 group-hover:text-white transition-colors shrink-0" />
                </Link>
              )}

              <div className="wl-up mt-6 flex flex-wrap gap-2" style={{ animationDelay: '.45s' }}>
                {allowed('dashboard') && (
                  <Link to="/" className="inline-flex items-center gap-2 rounded-full bg-white text-[#14231e] px-5 py-2.5 text-sm font-medium hover:bg-amber-50 transition-colors shadow-lg shadow-black/20">
                    Открыть дашборд <ArrowRight size={16} />
                  </Link>
                )}
                {allowed('sales') && (
                  <Link to="/sales" className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/20 px-5 py-2.5 text-sm hover:bg-white/15 transition-colors">
                    <TrendingUp size={15} />Продажи
                  </Link>
                )}
              </div>
            </div>

            <div className="hidden sm:flex items-center justify-center pr-2 md:pr-6 wl-float">
              <SignatureLogo />
            </div>
          </div>
        </section>

        <OfflineLeadsCard />

        {/* ── Коротко на сегодня ── */}
        <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {tiles.filter(t => allowed(t.page)).map((t, i) => (
            <StatTile key={t.to} {...t} delay={0.1 + i * 0.07} />
          ))}
        </section>

        {/* ── Лиды за 2 недели ── */}
        {s.reports && s.reports.length > 2 && allowed('daily-report') && (
          <Link to="/daily-report" className="wl-up group block rounded-2xl border border-border bg-card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all" style={{ animationDelay: '.4s' }}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Лиды за последние {s.reports.length} {plural(s.reports.length, 'день', 'дня', 'дней')}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  всего {s.reports.reduce((a, r) => a + r.leads, 0)} · звонков {s.reports.reduce((a, r) => a + r.calls, 0)} · чатов {s.reports.reduce((a, r) => a + r.chats, 0)}
                </div>
              </div>
              <span className="text-xs text-primary inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">Отчёты по дням <ArrowRight size={13} /></span>
            </div>
            <div className="h-28 mt-3 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={s.reports.map(r => ({ d: new Date(`${r.report_date}T12:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), Лиды: r.leads }))} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wlLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2f6b57" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2f6b57" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#8a8f8c' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <Tooltip cursor={{ stroke: '#2f6b57', strokeOpacity: 0.2 }} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                  <Area type="monotone" dataKey="Лиды" stroke="#2f6b57" strokeWidth={2.2} fill="url(#wlLeads)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Link>
        )}

        {/* ── Разделы ── */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Разделы</h2>
          <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {sections.map((item, i) => (
              <Link key={item.path} to={item.path} style={{ animationDelay: `${0.45 + i * 0.03}s` }}
                className="wl-up group relative flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3.5 text-sm hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 transition-all min-w-0 overflow-hidden">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <item.icon size={17} />
                </span>
                <span className="truncate font-medium">{item.label}</span>
                <ArrowUpRight size={14} className="ml-auto shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function StatTile({ to, icon: I, label, value, hint, color, delay }: {
  to: string; icon: React.ElementType; label: string; value: number | null; hint?: string; color: string; delay: number;
}) {
  const v = useCountUp(value, 900);
  return (
    <Link to={to} style={{ animationDelay: `${delay}s` }}
      className="wl-up group relative overflow-hidden rounded-2xl border border-border bg-card p-4 hover:-translate-y-0.5 hover:shadow-md transition-all min-w-0">
      <div aria-hidden className="absolute -right-6 -top-6 w-20 h-20 rounded-full opacity-10 group-hover:opacity-20 transition-opacity" style={{ background: color }} />
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: color }}><I size={15} /></span>
        <span className="text-xs text-muted-foreground leading-tight line-clamp-2">{label}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums" style={{ color: value ? color : undefined }}>
        {value == null ? '…' : Math.round(v)}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
    </Link>
  );
}
