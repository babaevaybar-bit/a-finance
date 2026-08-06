import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Menu, LayoutDashboard, TrendingUp, Wallet, BarChart2,
  Users, Banknote, CheckSquare, ShieldCheck, LogOut, User, TrendingDown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { path: '/',            label: 'Дашборд',        icon: LayoutDashboard, adminOnly: false, pageKey: 'dashboard' },
  { path: '/sales',       label: 'Продажи',         icon: TrendingUp,      adminOnly: false, pageKey: 'sales'     },
  { path: '/approvals',   label: 'Подтверждения',   icon: CheckSquare,     adminOnly: true,  pageKey: null        },
  { path: '/finance',     label: 'Финансы',          icon: Wallet,          adminOnly: true,  pageKey: null        },
  { path: '/reports',     label: 'Отчёты',           icon: BarChart2,       adminOnly: true,  pageKey: null        },
  { path: '/salary',      label: 'Зарплаты',         icon: Banknote,        adminOnly: true,  pageKey: null        },
  { path: '/profit',      label: 'Чистая прибыль',   icon: TrendingDown,    adminOnly: true,  pageKey: null        },
  { path: '/managers',    label: 'Сотрудники',       icon: Users,           adminOnly: true,  pageKey: null        },
  { path: '/permissions', label: 'Доступ',           icon: ShieldCheck,     adminOnly: true,  pageKey: null        },
];

function NavLinks({ onClose }: { onClose?: () => void }) {
  const { pathname } = useLocation();
  const { isAdmin, canView } = useAuth();

  const visibleItems = navItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    if (!isAdmin && item.pageKey && !canView(item.pageKey)) return false;
    return true;
  });

  return (
    <nav className="flex flex-col gap-1 p-4">
      {visibleItems.map(({ path, label, icon: Icon }) => (
        <Link
          key={path}
          to={path}
          onClick={onClose}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            pathname === path
              ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <Icon size={16} className="shrink-0" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const displayName = profile?.username ?? user?.email?.split('@')[0] ?? 'Пользователь';

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-sidebar-border bg-sidebar">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
          <span className="font-semibold text-sm text-sidebar-foreground tracking-wide">Aybar Finance</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        {/* User info desktop */}
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors text-left">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User size={13} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-sidebar-foreground">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{isAdmin ? 'Администратор' : 'Сотрудник'}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-44">
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
              <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
                <span className="font-semibold text-sm text-sidebar-foreground tracking-wide">Aybar Finance</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavLinks onClose={() => setOpen(false)} />
              </div>
              <div className="border-t border-sidebar-border p-3">
                <div className="flex items-center gap-2 px-2 py-1 mb-1">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User size={13} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-sidebar-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{isAdmin ? 'Администратор' : 'Сотрудник'}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive h-8 text-xs px-2"
                  onClick={() => { setOpen(false); handleSignOut(); }}>
                  <LogOut size={13} className="mr-2" />Выйти
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-semibold text-sm flex-1 min-w-0 truncate">Aybar Finance</span>
        </header>

        <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
