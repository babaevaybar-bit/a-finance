import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface RouteGuardProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export function RouteGuard({ children, adminOnly }: RouteGuardProps) {
  const { user, profile, isAdmin, loading } = useAuth();
  const location = useLocation();

  // Показываем пустой экран пока идёт загрузка сессии
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

  // Есть сессия, но нет профиля — администратор зашёл без профиля (технический случай)
  // Пускаем дальше, isAdmin=false в этом случае закроет adminOnly маршруты
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
