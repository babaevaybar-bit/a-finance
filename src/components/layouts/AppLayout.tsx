import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Menu, Settings, Activity, ChevronDown, GraduationCap, Calculator, LayoutDashboard, TrendingUp, Wallet, BarChart2,
  Users, Banknote, CheckSquare, ShieldCheck, LogOut, User, TrendingDown, ClipboardList, Layers, Search, Wrench, Bell, HandCoins, KanbanSquare,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { countPendingDeals, countUnreadNotifications } from '@/lib/api';
import { supabase } from '@/db/supabase';
import { UserAvatar } from '@/components/common/UserAvatar';

// Разделы, сгруппированные по смыслу. «Сообщения» — колокольчиком в верхней панели (в меню не показываем).
export const NAV_GROUPS = ['Продажи', 'Деньги', 'Производство', 'Клиенты и лиды', 'Команда'] as const;
export const navItems = [
  { path: '/',             label: 'Дашборд',          icon: LayoutDashboard, adminOnly: false, pageKey: 'dashboard',    group: 'Продажи' },
  { path: '/sales',        label: 'Продажи',           icon: TrendingUp,      adminOnly: false, pageKey: 'sales',        group: 'Продажи' },
  { path: '/debtors',      label: 'Должники',          icon: HandCoins,       adminOnly: false, pageKey: 'debtors',      group: 'Продажи' },
  { path: '/approvals',    label: 'Подтверждения',     icon: CheckSquare,     adminOnly: true,  pageKey: 'approvals',    group: 'Продажи' },
  { path: '/estimate',     label: 'Просчёт',           icon: Calculator,      adminOnly: false, pageKey: 'estimate',     group: 'Продажи' },
  { path: '/finance',      label: 'Финансы',           icon: Wallet,          adminOnly: true,  pageKey: 'finance',      group: 'Деньги' },
  { path: '/reports',      label: 'Отчёты',            icon: BarChart2,       adminOnly: true,  pageKey: 'reports',      group: 'Деньги' },
  { path: '/salary',       label: 'Зарплаты',          icon: Banknote,        adminOnly: true,  pageKey: 'salary',       group: 'Деньги' },
  { path: '/profit',       label: 'Чистая прибыль',    icon: TrendingDown,    adminOnly: true,  pageKey: 'profit',       group: 'Деньги' },
  { path: '/production',   label: 'Производство',      icon: Wrench,          adminOnly: true,  pageKey: 'production',   group: 'Производство' },
  { path: '/boards',       label: 'Доски',             icon: KanbanSquare,    adminOnly: true,  pageKey: 'boards',       group: 'Производство' },
  { path: '/amocrm',       label: 'amoCRM',            icon: Layers,          adminOnly: true,  pageKey: 'amocrm',       group: 'Клиенты и лиды' },
  { path: '/daily-report', label: 'Ежедневный отчёт',  icon: ClipboardList,   adminOnly: false, pageKey: 'daily-report', group: 'Клиенты и лиды' },
  { path: '/managers',     label: 'Сотрудники',        icon: Users,           adminOnly: true,  pageKey: 'managers',     group: 'Команда' },
  { path: '/activity',     label: 'Активность',        icon: Activity,        adminOnly: true,  pageKey: 'activity',     group: 'Команда' },
  { path: '/permissions',  label: 'Доступ',            icon: ShieldCheck,     adminOnly: true,  pageKey: 'permissions',  group: 'Команда' },
  { path: '/training',     label: 'Обучение',          icon: GraduationCap,   adminOnly: false, pageKey: 'training',     group: 'Команда' },
  { path: '/messages',     label: 'Сообщения',         icon: Bell,            adminOnly: false, pageKey: 'messages',     group: 'hidden' },
];

// Счётчики для меню и колокольчика: ждут подтверждения / непрочитанные сообщения
function useCounters() {
  const { profile, canViewAllManagers, canApprove } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    const managerFilter = canViewAllManagers ? null : (profile?.manager_id ?? null);
    const refresh = () => {
      if (canApprove) countPendingDeals().then(setPendingCount).catch(() => {});
      countUnreadNotifications(managerFilter).then(setUnreadCount).catch(() => {});
    };
    refresh();
    window.addEventListener('afin:counters', refresh);
    const t = setInterval(refresh, 120_000);
    return () => { window.removeEventListener('afin:counters', refresh); clearInterval(t); };
  }, [canApprove, canViewAllManagers, profile?.manager_id]);
  return { unreadCount, pendingCount };
}

function readCollapsed(): string[] {
  try { return JSON.parse(localStorage.getItem('afin-nav-collapsed') || '[]'); } catch { return []; }
}

function NavLinks({ onClose }: { onClose?: () => void }) {
  const { pathname } = useLocation();
  const { isAdmin, canView } = useAuth();
  const { pendingCount } = useCounters();
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);

  const visibleItems = navItems.filter(item => item.group !== 'hidden' && (isAdmin || canView(item.pageKey)));
  const isActive = (path: string) => pathname === path || (path === '/boards' && pathname.startsWith('/boards/'));
  // Мало разделов (например, у менеджера) — без групп, простым списком
  const flat = visibleItems.length <= 6;

  function toggle(g: string) {
    setCollapsed(prev => {
      const next = prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g];
      try { localStorage.setItem('afin-nav-collapsed', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const renderItem = ({ path, label, icon: Icon }: typeof navItems[number]) => (
    <Link
      key={path}
      to={path}
      onClick={onClose}
      className={cn(
        'flex items-center gap-3 px-3 py-[7px] rounded-md text-sm font-medium transition-colors',
        isActive(path)
          ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {path === '/boards' && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold shrink-0">бета</span>
      )}
      {path === '/approvals' && pendingCount > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-semibold shrink-0">{pendingCount}</span>
      )}
    </Link>
  );

  if (flat) return <nav className="flex flex-col gap-0.5 p-3">{visibleItems.map(renderItem)}</nav>;

  return (
    <nav className="flex flex-col p-3 gap-2">
      {NAV_GROUPS.map(g => {
        const items = visibleItems.filter(i => i.group === g);
        if (!items.length) return null;
        const hasActive = items.some(i => isActive(i.path));
        const open = hasActive || !collapsed.includes(g);
        const badge = g === 'Продажи' && !open && pendingCount > 0;
        return (
          <div key={g}>
            <button type="button" onClick={() => toggle(g)}
              className="w-full flex items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground">
              <span className="flex-1 text-left">{g}</span>
              {badge && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
              <ChevronDown size={12} className={cn('transition-transform', open ? '' : '-rotate-90')} />
            </button>
            {open && <div className="flex flex-col gap-0.5 mt-0.5">{items.map(renderItem)}</div>}
          </div>
        );
      })}
    </nav>
  );
}

// Колокольчик «Сообщения» со счётчиком непрочитанных — в верхней панели
function MessagesBell() {
  const { unreadCount } = useCounters();
  const { pathname } = useLocation();
  return (
    <Link to="/messages" title="Сообщения"
      className={cn('relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted transition-colors shrink-0',
        pathname === '/messages' ? 'bg-muted text-primary' : 'text-muted-foreground')}>
      <Bell size={18} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-background">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

function GlobalSearchBar() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      className="relative flex-1 max-w-sm"
      onSubmit={e => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}
    >
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Найти клиента по имени или телефону..."
        className="w-full h-8 rounded-md border border-border bg-muted/30 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background"
      />
    </form>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user, profile, isDirector, isDirectorView, isRop, isLidorub, signOut, canView } = useAuth();
  const roleLabel = isDirector ? 'Главный админ' : isDirectorView ? 'Директор' : isRop ? 'РОП' : isLidorub ? 'Лидоруб' : 'Менеджер';
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const displayName = (profile?.name && profile.name !== 'admin') ? profile.name : (user?.email?.split('@')[0] ?? 'Пользователь');

  // Учёт времени на сайте: раз в минуту «я активен» — только если вкладка открыта и человек что-то делал за последние 2 минуты
  useEffect(() => {
    if (!user) return;
    let lastInput = Date.now();
    const mark = () => { lastInput = Date.now(); };
    const evs = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    evs.forEach(e => window.addEventListener(e, mark, { passive: true }));
    const ping = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastInput > 120_000) return;
      supabase.rpc('touch_presence', { p_page: window.location.pathname }).then(() => {}, () => {});
    };
    ping();
    const t = setInterval(ping, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') { mark(); ping(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); evs.forEach(e => window.removeEventListener(e, mark)); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Стартовая страница из профиля: один раз за сессию при открытии «/»
  const location = useLocation();
  useEffect(() => {
    if (!profile || location.pathname !== '/') return;
    try {
      if (sessionStorage.getItem('afin-start-applied')) return;
      sessionStorage.setItem('afin-start-applied', '1');
    } catch { return; }
    if (profile.start_page === '/welcome') navigate('/welcome', { replace: true });
  }, [profile, location.pathname, navigate]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-sidebar-border bg-sidebar sticky top-0 h-screen">
        <Link to="/welcome" title="Главная" className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border hover:bg-sidebar-accent/60 transition-colors">
          <span className="w-7 h-7 rounded-[8px] bg-black text-white flex items-center justify-center text-xs font-display font-bold shrink-0">A</span>
          <span className="font-semibold text-sm text-sidebar-foreground tracking-wide">A-Finance</span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        {/* User info desktop */}
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-left">
                <UserAvatar name={displayName} url={profile?.avatar_url} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-sidebar-foreground">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
                <Settings size={14} className="text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/profile')}>
                <User size={14} className="mr-2" />Мой профиль и настройки
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer" onClick={handleSignOut}>
                <LogOut size={14} className="mr-2" />Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar (mobile) */}
        <header className="h-14 flex items-center px-4 border-b border-border bg-background lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-3">
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-56 p-0 bg-sidebar flex flex-col">
              <Link to="/welcome" className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border hover:bg-sidebar-accent/60 transition-colors">
                <span className="w-7 h-7 rounded-[8px] bg-black text-white flex items-center justify-center text-xs font-display font-bold shrink-0">A</span>
                <span className="font-semibold text-sm text-sidebar-foreground tracking-wide">A-Finance</span>
              </Link>
              <div className="flex-1 overflow-y-auto">
                <NavLinks onClose={() => setOpen(false)} />
              </div>
              <div className="border-t border-sidebar-border p-3">
                <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md hover:bg-sidebar-accent">
                  <UserAvatar name={displayName} url={profile?.avatar_url} size={30} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-sidebar-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel}</p>
                  </div>
                  <Settings size={14} className="text-muted-foreground shrink-0" />
                </Link>
                <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive h-8 text-xs px-2"
                  onClick={() => { setOpen(false); handleSignOut(); }}>
                  <LogOut size={13} className="mr-2" />Выйти
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <Link to="/welcome" className="flex items-center flex-1 min-w-0">
            <span className="w-7 h-7 rounded-[8px] bg-black text-white flex items-center justify-center text-xs font-display font-bold shrink-0">A</span>
            <span className="font-semibold text-sm min-w-0 truncate ml-2">A-Finance</span>
          </Link>
        </header>

        {/* Полоса поиска — видна на всех страницах и устройствах */}
        <div className="h-12 flex items-center gap-2 px-4 md:px-6 border-b border-border bg-background shrink-0 sticky top-0 z-30">
          <GlobalSearchBar />
          {canView('messages') || isDirector || isDirectorView ? <div className="ml-auto"><MessagesBell /></div> : null}
        </div>

        <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
