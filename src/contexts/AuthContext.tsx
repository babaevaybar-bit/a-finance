import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, EmployeePermission } from '@/types/types';
import { getPermissionsForManager } from '@/lib/api';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data ?? null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  canApprove: boolean;    // может подтверждать/отклонять сделки
  loading: boolean;
  permissions: EmployeePermission[];
  canView: (page: string) => boolean;
  canEdit: (page: string) => boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [profile, setProfile]         = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<EmployeePermission[]>([]);
  const [loading, setLoading]         = useState(true);

  // Dev shortcut: disable real auth when VITE_DISABLE_AUTH=true
  const DISABLE_AUTH = Boolean(import.meta.env.VITE_DISABLE_AUTH);

  const isAdmin = profile?.role === 'admin';

  // Может подтверждать/отклонять сделки: admin всегда, остальные — если есть can_approve на странице approvals
  const canApprove = isAdmin || permissions.some(p => p.page === 'approvals' && p.can_approve);

  async function loadPermissions(managerId: string | null | undefined) {
    if (!managerId) { setPermissions([]); return; }
    try {
      const perms = await getPermissionsForManager(managerId);
      setPermissions(perms);
    } catch { setPermissions([]); }
  }

  const refreshProfile = async () => {
    if (!user) { setProfile(null); setPermissions([]); return; }
    const p = await fetchProfile(user.id);
    setProfile(p);
    await loadPermissions(p?.manager_id);
  };

  useEffect(() => {
    if (DISABLE_AUTH) {
      // Provide a fake user/profile for local development to bypass auth
      const fakeUser = { id: 'dev-user', email: 'dev@local' } as unknown as User;
      setUser(fakeUser);
      setProfile({ id: 'dev-user', name: 'Dev User', role: 'admin', manager_id: null } as any);
      setPermissions([]);
      setLoading(false);
    } else {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const p = await fetchProfile(session.user.id);
          setProfile(p);
          await loadPermissions(p?.manager_id);
        }
      }).finally(() => setLoading(false));
    }

    if (DISABLE_AUTH) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
        await loadPermissions(p?.manager_id);
      } else {
        setProfile(null);
        setPermissions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const trimmed = username.trim().toLowerCase();
      const email = trimmed.includes('@') ? trimmed : `${trimmed}@aybar.app`;

      // Логируем используемый email и ошибки для диагностики (НЕ логируем пароль)
      // eslint-disable-next-line no-console
      console.debug('Auth: signIn attempt', { email });

      if (DISABLE_AUTH) {
        // In dev mode just accept any credentials
        // eslint-disable-next-line no-console
        console.debug('Auth: dev signIn bypass', { email });
        setUser({ id: email, email } as unknown as User);
        setProfile({ id: email, name: 'Dev User', role: 'admin', manager_id: null } as any);
        return { error: null };
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      // eslint-disable-next-line no-console
      if (error) console.debug('Auth: signIn response error', { message: error.message, status: (error as any)?.status });

      if (error) return { error: error.message ?? 'Неверный логин или пароль' };
      return { error: null };
    } catch (err: any) {
      // На случай сетевых/неожиданных ошибок — возвращаем понятное сообщение
      const msg = err?.message ?? String(err) ?? 'Ошибка при подключении к серверу аутентификации';
      // eslint-disable-next-line no-console
      console.error('Auth: signIn exception', err);
      return { error: msg };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setPermissions([]);
  };

  // Разделы, скрытые по умолчанию для сотрудников (adminOnly).
  // Становятся видимыми только если администратор явно разрешил через PermissionsPage.
  const ADMIN_ONLY_PAGES = new Set(['approvals','finance','reports','salary','profit','managers','permissions']);

  // Admin — полный доступ; сотрудник — по записи в employee_permissions.
  // Для adminOnly-разделов умолчание false (скрыто), для остальных — true (открыто).
  function canView(page: string): boolean {
    if (isAdmin) return true;
    const perm = permissions.find(p => p.page === page);
    if (perm) return perm.can_view;
    return !ADMIN_ONLY_PAGES.has(page); // adminOnly → false по умолчанию
  }

  function canEdit(page: string): boolean {
    if (isAdmin) return true;
    const perm = permissions.find(p => p.page === page);
    if (perm) return perm.can_edit;
    return !ADMIN_ONLY_PAGES.has(page);
  }

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, canApprove, loading, permissions, canView, canEdit, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
