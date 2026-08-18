import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldOff } from 'lucide-react';

interface RouteGuardProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  pageKey?: string;
}

// ─── Заглушка «Доступ запрещён» ───────────────────────────────────────────────
function AccessDenied() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <ShieldOff size={44} className="text-muted-foreground/30" strokeWidth={1.5} />
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Доступ запрещён</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            У вас нет прав для просмотра этого раздела.<br />
            Обратитесь к администратору.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

export function RouteGuard({ children, adminOnly, pageKey }: RouteGuardProps) {
  const { user, isAdmin, loading, canView } = useAuth();
  const location = useLocation();

  // Загрузка сессии
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Нет сессии → на логин
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // adminOnly-раздел: не-администраторы видят заглушку
  if (adminOnly && !isAdmin) {
    return <AccessDenied />;
  }

  // Проверка per-employee разрешения по pageKey
  if (pageKey && !isAdmin && !canView(pageKey)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
