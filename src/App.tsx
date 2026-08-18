import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import LoginPage from '@/pages/LoginPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';

// Lazy-load all pages to reduce initial bundle size
const DashboardPage    = lazy(() => import('@/pages/DashboardPage'));
const SalesPage        = lazy(() => import('@/pages/SalesPage'));
const ApprovalsPage    = lazy(() => import('@/pages/ApprovalsPage'));
const FinancePage      = lazy(() => import('@/pages/FinancePage'));
const ReportsPage      = lazy(() => import('@/pages/ReportsPage'));
const SalaryPage       = lazy(() => import('@/pages/SalaryPage'));
const ProfitPage       = lazy(() => import('@/pages/ProfitPage'));
const DailyReportPage  = lazy(() => import('@/pages/DailyReportPage'));
const ManagersPage     = lazy(() => import('@/pages/ManagersPage'));
const PermissionsPage  = lazy(() => import('@/pages/PermissionsPage'));

function PageLoader() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Скелетон боковой панели (desktop) */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-sidebar-border bg-sidebar">
        <div className="h-14 border-b border-sidebar-border flex items-center px-4">
          <div className="h-4 w-28 rounded bg-muted animate-pulse" />
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="w-4 h-4 rounded bg-muted animate-pulse shrink-0" />
              <div
                className="h-3 rounded bg-muted animate-pulse"
                style={{ width: `${52 + (i % 3) * 16}%`, animationDelay: `${i * 60}ms` }}
              />
            </div>
          ))}
        </nav>
      </aside>

      {/* Скелетон основного контента */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Шапка */}
        <div className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        </div>

        {/* Контент страницы */}
        <main className="flex-1 p-4 md:p-6 space-y-6">
          {/* Заголовок страницы */}
          <div className="h-7 w-48 rounded bg-muted animate-pulse" />

          {/* Строка карточек-метрик */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                <div className="h-6 w-28 rounded bg-muted animate-pulse" />
                <div className="h-2 w-16 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>

          {/* Большой блок (таблица / график) */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="h-4 w-36 rounded bg-muted animate-pulse" />
            <div className="space-y-2 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="h-3 rounded bg-muted animate-pulse flex-1" />
                  <div className="h-3 w-20 rounded bg-muted animate-pulse shrink-0" />
                  <div className="h-3 w-16 rounded bg-muted animate-pulse shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

const lazyRoutes = [
  { path: '/',             element: <DashboardPage />,   adminOnly: false, pageKey: 'dashboard'    },
  { path: '/sales',        element: <SalesPage />,        adminOnly: false, pageKey: 'sales'        },
  { path: '/approvals',    element: <ApprovalsPage />,    adminOnly: false, pageKey: 'approvals'    },
  { path: '/finance',      element: <FinancePage />,      adminOnly: true,  pageKey: 'finance'      },
  { path: '/reports',      element: <ReportsPage />,      adminOnly: true,  pageKey: 'reports'      },
  { path: '/salary',       element: <SalaryPage />,       adminOnly: true,  pageKey: 'salary'       },
  { path: '/profit',       element: <ProfitPage />,       adminOnly: true,  pageKey: 'profit'       },
  { path: '/daily-report', element: <DailyReportPage />,  adminOnly: false, pageKey: 'daily-report' },
  { path: '/managers',     element: <ManagersPage />,     adminOnly: true,  pageKey: 'managers'     },
  { path: '/permissions',  element: <PermissionsPage />,  adminOnly: true,  pageKey: 'permissions'  },
];

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <IntersectObserver />
        <div className="flex flex-col min-h-screen">
          <main className="flex-grow">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                {lazyRoutes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={
                      <RouteGuard adminOnly={route.adminOnly} pageKey={route.pageKey}>
                        {route.element}
                      </RouteGuard>
                    }
                  />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
        <Toaster />
      </AuthProvider>
    </Router>
  );
};

export default App;

