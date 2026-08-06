import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, LayoutDashboard, TrendingUp, Wallet, BarChart2, Users, Banknote, CheckSquare } from 'lucide-react';

const navItems = [
  { path: '/',           label: 'Дашборд',      icon: LayoutDashboard, adminOnly: false },
  { path: '/sales',      label: 'Продажи',      icon: TrendingUp,      adminOnly: false },
  { path: '/approvals',  label: 'Подтверждения',icon: CheckSquare,     adminOnly: true  },
  { path: '/finance',    label: 'Финансы',       icon: Wallet,          adminOnly: true  },
  { path: '/reports',    label: 'Отчёты',        icon: BarChart2,       adminOnly: true  },
  { path: '/salary',     label: 'Зарплаты',      icon: Banknote,        adminOnly: true  },
  { path: '/managers',   label: 'Сотрудники',    icon: Users,           adminOnly: true  },
];

function NavLinks({ onClose }: { onClose?: () => void }) {
  const { pathname } = useLocation();
  // Auth disabled: show all nav items
  const visibleItems = navItems;

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
