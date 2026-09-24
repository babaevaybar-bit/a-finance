import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, EmployeePermission } from '@/types/types';
import { getPermissionsForManager } from '@/lib/api';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;       // алиас isDirector, для обратной совместимости со старым кодом
  isDirector: boolean;    // Директор — полный доступ
  isRop: boolean;         // РОП — CRM и отчёты по всем менеджерам
  isManager: boolean;     // Менеджер — только свои клиенты/сделки
  isLidorub: boolean;     // Лидоруб — доступ как у менеджера, ЗП как у РОП (от общей выручки)
  canApprove: boolean;    // может подтверждать/отклонять сделки
  canViewAllManagers: boolean; // видит CRM/сделки всех менеджеров (director или rop)
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
  // Also allow immediate bypass via URL query `?disable_auth=1` for testing without restarting dev server
  const DISABLE_AUTH_ENV = Boolean(import.meta.env.VITE_DISABLE_AUTH);
  const [disableAuth, setDisableAuth] = useState<boolean>(DISABLE_AUTH_ENV);

  const isDirector = profile?.role === 'director';
  const isRop      = profile?.role === 'rop';
  const isManager  = profile?.role === 'manager';
  const isLidorub  = profile?.role === 'lidorub';
  const isAdmin    = isDirector; // обратная совместимость со старым кодом

  // Директор и РОП видят сделки/CRM всех менеджеров; обычный менеджер — только свои
  const canViewAllManagers = isDirector || isRop;

  // Может подтверждать/отклонять сделки: директор и РОП всегда, остальные — по разрешению can_approve
  const canApprove = isDirector || isRop || permissions.some(p => p.page === 'approvals' && p.can_approve);

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
    const runtimeDisable = DISABLE_AUTH_ENV || new URLSearchParams(window.location.search).get('disable_auth') === '1';
    setDisableAuth(runtimeDisable);

    if (runtimeDisable) {
      // Provide a fake user/profile for local development to bypass auth
      const fakeUser = { id: 'dev-user', email: 'dev@local' } as unknown as User;
      setUser(fakeUser);
      setProfile({ id: 'dev-user', name: 'Dev User', role: 'director', manager_id: null } as any);
      setPermissions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // requestId защищает от гонки состояний: если пока грузился профиль
    // пришло новое auth-событие, применяем только самый свежий результат.
    let requestId = 0;

    async function applySession(session: { user: User } | null) {
      const myRequestId = ++requestId;
      const u = session?.user ?? null;
      if (cancelled) return;
      setUser(u);

      if (!u) {
        setProfile(null);
        setPermissions([]);
        return;
      }

      try {
        const p = await fetchProfile(u.id);
        if (cancelled || myRequestId !== requestId) return;
        setProfile(p);
        await loadPermissions(p?.manager_id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Auth: failed to load profile', err);
        if (cancelled || myRequestId !== requestId) return;
        setProfile(null);
        setPermissions([]);
      }
    }

    // Начальная сессия при загрузке страницы
    supabase.auth.getSession()
      .then(({ data: { session } }) => applySession(session))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Auth: getSession failed', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Реакция на login/logout/обновление токена
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    // Chrome/Safari иногда восстанавливают страницу из bfcache со старым,
    // замороженным состоянием React — принудительно перезагружаем в этом случае,
    // чтобы не залипать на бесконечном спиннере.
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const trimmed = username.trim().toLowerCase();
      let email = trimmed;

      if (!trimmed.includes('@')) {
        // Логин, не email — ищем настоящий auth-email этого пользователя по имени профиля.
        // Так реальная почта сотрудника (для восстановления пароля) остаётся в Supabase Auth,
        // а входить он может коротким логином.
        const { data: found } = await supabase
          .from('profiles')
          .select('email')
          .eq('name', trimmed)
          .maybeSingle();
        email = found?.email || `${trimmed}@aybar.app`; // старые аккаунты без настоящей почты
      }

      // Логируем используемый email и ошибки для диагностики (НЕ логируем пароль)
      // eslint-disable-next-line no-console
      console.debug('Auth: signIn attempt', { email });

      if (disableAuth) {
        // In dev mode just accept any credentials
        // eslint-disable-next-line no-console
        console.debug('Auth: dev signIn bypass', { email });
        setUser({ id: email, email } as unknown as User);
        setProfile({ id: email, name: 'Dev User', role: 'director', manager_id: null } as any);
        return { error: null };
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      // eslint-disable-next-line no-console
      if (error) console.debug('Auth: signIn response error', { message: error.message, status: (error as any)?.status });

      if (error) return { error: error.message ?? 'Неверный логин или пароль' };
      // После успешного входа подгружаем профиль и права заново
      try {
        await refreshProfile();
      } catch {
        // ignore
      }
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

  // Разделы, полностью закрытые для всех кроме Директора (финансы, ФОТ, права доступа).
  const DIRECTOR_ONLY_PAGES = new Set(['finance', 'profit', 'salary', 'managers', 'permissions']);
  // Разделы надзора за продажами: по умолчанию видны Директору и РОП, менеджеру — по явному разрешению.
  const ROP_PAGES = new Set(['approvals', 'reports', 'amocrm', 'production']);
  const RESTRICTED_BY_DEFAULT = new Set([...DIRECTOR_ONLY_PAGES, ...ROP_PAGES]);

  // Директор — полный доступ везде.
  // РОП — полный доступ к разделам надзора (approvals, reports) + видит sales/CRM всех менеджеров,
  //   но не финансовые/зарплатные/административные разделы.
  // Менеджер — только то, что явно разрешено в employee_permissions (по умолчанию скрыты RESTRICTED_BY_DEFAULT).
  function canView(page: string): boolean {
    if (isDirector) return true;
    if (isRop && ROP_PAGES.has(page)) return true;
    const perm = permissions.find(p => p.page === page);
    if (perm) return perm.can_view;
    return !RESTRICTED_BY_DEFAULT.has(page);
  }

  function canEdit(page: string): boolean {
    if (isDirector) return true;
    if (isRop && ROP_PAGES.has(page)) return true;
    const perm = permissions.find(p => p.page === page);
    if (perm) return perm.can_edit;
    return !RESTRICTED_BY_DEFAULT.has(page);
  }

  return (
    <AuthContext.Provider value={{
      user, profile, isAdmin, isDirector, isRop, isManager, isLidorub, canApprove, canViewAllManagers,
      loading, permissions, canView, canEdit, signIn, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
