import React from 'react';

interface RouteGuardProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

// Auth temporarily disabled — all routes accessible without login
export function RouteGuard({ children }: RouteGuardProps) {
  return <>{children}</>;
}
