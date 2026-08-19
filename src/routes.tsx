import DashboardPage from './pages/DashboardPage';
import SalesPage from './pages/SalesPage';
import FinancePage from './pages/FinancePage';
import ReportsPage from './pages/ReportsPage';
import ManagersPage from './pages/ManagersPage';
import SalaryPage from './pages/SalaryPage';
import ApprovalsPage from './pages/ApprovalsPage';
import PermissionsPage from './pages/PermissionsPage';
import ProfitPage from './pages/ProfitPage';
import type { ReactNode } from 'react';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  adminOnly?: boolean;
}

export const routes: RouteConfig[] = [
  { name: 'Дашборд',          path: '/',            element: <DashboardPage />,    adminOnly: false },
  { name: 'Продажи',          path: '/sales',       element: <SalesPage />,        adminOnly: false },
  { name: 'Подтверждения',    path: '/approvals',   element: <ApprovalsPage />,    adminOnly: true  },
  { name: 'Финансы',          path: '/finance',     element: <FinancePage />,      adminOnly: true  },
  { name: 'Отчёты',           path: '/reports',     element: <ReportsPage />,      adminOnly: true  },
  { name: 'Зарплаты',         path: '/salary',      element: <SalaryPage />,       adminOnly: true  },
  { name: 'Чистая прибыль',   path: '/profit',      element: <ProfitPage />,       adminOnly: true  },
  { name: 'Сотрудники',       path: '/managers',    element: <ManagersPage />,     adminOnly: true  },
  { name: 'Доступ',           path: '/permissions', element: <PermissionsPage />,  adminOnly: true  },
];
<Route path="/" element={<HomePage />} />