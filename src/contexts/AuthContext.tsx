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
  isAdmin: boolean;       // алиас isDirector || isDirectorView, для обратной совместимости со старым кодом
  isDirector: boolean;    // Главный админ — полный доступ, включая управление сотрудниками/правами
  isDirectorView: boolean; // Директор — видит всё, но не создаёт/не редактирует сотрудников и права
  isRop: boolean;         // РОП — CRM и отчёты по всем менеджерам
  isManager: boolean;     // Менеджер — только свои клиенты/сделки
  isLidorub: boolean;     // Лидоруб — доступ как у менеджера, ЗП как у РОП (от общей выручки)
  canApprove: boolean;    // может подтверждать/отклонять сделки
  canViewAllManagers: boolean; // видит сделки всех менеджеров (руководители или «Сделки: все»)
  canEditAllDeals: boolean;    // может править чужие сделки
  canViewAllLeads: boolean;    // видит лиды (CRM, офлайн, клиенты) всех менеджеров
  canEditAllLeads: boolean;
  loading: boolean;
  permissions: EmployeePermission[];
  canView: (page: string) => boolean;
  canEdit: (page: string) => boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

/** Разделы «в разработке»: менеджеры видят заглушку, руководители работают как обычно */
export const IN_DEVELOPMENT = new Set(['estimate', 'training']);

/** Разделы, которые менеджеру не открыть даже вручную: там данные всей компании и управление людьми.
 *  Нужен такой доступ — смените роль на РОП или Директор. */
export const MANAGER_LOCKED = new Set(['managers', 'permissions']);
/** Чьи данные видит сотрудник (строки employee_permissions с page = 'scope:<область>'):
 *  нет строки / can_view=false — только свои; can_view — все (просмотр); can_view+can_edit — все с правкой */
export const DATA_SCOPES = [
  { key: 'scope:deals', label: 'Сделки', hint: 'Продажи, должники, подтверждения, отчёты, дашборд' },
  { key: 'scope:leads', label: 'Лиды и клиенты', hint: 'CRM, офлайн-лиды салона, клиентская база' },
] as const;
export type ScopeLevel = 'own' | 'view' | 'edit';
export function scopeLevel(row?: { can_view: boolean; can_edit: boolean } | null): ScopeLevel {
  return row?.can_view ? (row.can_edit ? 'edit' : 'view') : 'own';
}

/** Права менеджера по продажам по умолчанию; в «Доступе» их можно поднять или убрать для конкретного сотрудника */
export const MANAGER_POLICY: Record<string, 'edit' | 'view' | 'none'> = {
  dashboard: 'edit',
  sales: 'edit',
  debtors: 'edit',
  approvals: 'view',       // только статус своих сделок
  estimate: 'edit',        // пока «в разработке»
  finance: 'none',
  reports: 'view',
  salary: 'view',          // только своя зарплата
  profit: 'none',
  production: 'view',
  boards: 'edit',
  amocrm: 'edit',
  crm: 'edit',
  'daily-report': 'none',
  managers: 'none',
  activity: 'none',
  permissions: 'none',
  training: 'view',        // пока «в разработке»
  messages: 'edit',
  search: 'edit',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<User | null>(null);
  const [profile, setProfile]         = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<EmployeePermission[]>([]);
  const [loading, setLoading]         = useState(true);

  // Dev shortcut: disable real auth when VITE_DISABLE_AUTH=true
  // Also allow immediate bypass via URL query `?disable_auth=1` for testing without restarting dev server
  const DISABLE_AUTH_ENV = Boolean(import.meta.env.VITE_DISABLE_AUTH);
  const [disableAuth, setDisableAuth] = useState<boolean>(import.meta.env.DEV && DISABLE_AUTH_ENV);

  const isDirector = profile?.role === 'director';
  const isDirectorView = profile?.role === 'director_view'; // Директор — видит всё, но не управляет сотрудниками/правами
  const isRop      = profile?.role === 'rop';
  const isManager  = profile?.role === 'manager';
  const isLidorub  = profile?.role === 'lidorub';
  const isAdmin    = isDirector || isDirectorView; // обратная совместимость со старым кодом + доступ ко всем adminOnly-разделам

  // Директор и РОП видят сделки/CRM всех менеджеров; обычный менеджер — только свои
  const boss = isDirector || isDirectorView || isRop;
  const scope = (area: string) => scopeLevel(permissions.find(p => p.page === `scope:${area}`));
  const canViewAllManagers = boss || scope('deals') !== 'own';
  const canEditAllDeals    = boss || scope('deals') === 'edit';
  const canViewAllLeads    = boss || scope('leads') !== 'own';
  const canEditAllLeads    = boss || scope('leads') === 'edit';

  // Может подтверждать/отклонять сделки: директор и РОП всегда, остальные — по разрешению can_approve
  const canApprove = isDirector || isDirectorView || isRop || permissions.some(p => p.page === 'approvals' && p.can_approve);

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
    // Обход входа — только при локальной разработке, на сайте он не работает
    const runtimeDisable = import.meta.env.DEV && (DISABLE_AUTH_ENV || new URLSearchParams(window.location.search).get('disable_auth') === '1');
    setDisableAuth(runtimeDisable);

    if (runtimeDisable) {
      // Provide a fake user/profile for local development to bypass auth
      const fakeUser = { id: 'dev-user', email: 'dev@local' } as unknown as User;
      setUser(fakeUser);
      // ?as=manager — посмотреть сайт глазами менеджера (только локально)
      const asRole = new URLSearchParams(window.location.search).get('as');
      setProfile(asRole
        ? { id: 'dev-user', name: 'Dev Manager', role: asRole, manager_id: 'm1' } as any
        : { id: 'dev-user', name: 'Dev User', role: 'director', manager_id: null } as any);
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
        const { data: found } = await supabase.rpc('login_email', { p_login: trimmed });
        email = (found as string | null) || `${trimmed}@aybar.app`; // старые аккаунты без настоящей почты
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

      if (error) {
        const m = (error.message ?? '').toLowerCase();
        if (m.includes('invalid login') || m.includes('invalid credentials')) return { error: 'Неверный логин или пароль. Проверьте раскладку (пароль — латиницей) и большие буквы; если не получается — попросите руководителя задать новый пароль' };
        if (m.includes('not confirmed')) return { error: 'Аккаунт ещё не активирован — попросите руководителя нажать «Подтвердить вручную» в карточке сотрудника' };
        if (m.includes('rate limit') || m.includes('too many')) return { error: 'Слишком много попыток — подождите минуту' };
        return { error: error.message || 'Неверный логин или пароль' };
      }
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

  // Менеджер по продажам (и лидоруб): права заданы ролью, а не галочками в «Доступе».
  // edit — полный доступ, view — только просмотр, none — раздел скрыт.
  const salesPolicy = isManager || isLidorub;

  // Разделы, полностью закрытые для всех кроме Директора (финансы, ФОТ, права доступа).
  const DIRECTOR_ONLY_PAGES = new Set(['finance', 'profit', 'salary', 'managers', 'permissions']);
  // Разделы надзора за продажами: по умолчанию видны Директору и РОП, менеджеру — по явному разрешению.
  const ROP_PAGES = new Set(['approvals', 'reports', 'amocrm', 'production']);
  const RESTRICTED_BY_DEFAULT = new Set([...DIRECTOR_ONLY_PAGES, ...ROP_PAGES]);

  // Директор — полный доступ везде.
  // РОП — полный доступ к разделам надзора (approvals, reports) + видит sales/CRM всех менеджеров,
  //   но не финансовые/зарплатные/административные разделы.
  // Менеджер — только то, что явно разрешено в employee_permissions (по умолчанию скрыты RESTRICTED_BY_DEFAULT).
  // Разделы, в которых управление (создание/изменение сотрудников, выдача прав)
  // остаётся строго за Главным админом — «Директор» видит их, но не редактирует.
  const DIRECTOR_ONLY_EDIT_PAGES = new Set(['managers', 'permissions']);

  function canView(page: string): boolean {
    if (isDirector || isDirectorView) return true;
    if (salesPolicy) {
      if (MANAGER_LOCKED.has(page)) return false;
      const perm = permissions.find(p => p.page === page);   // поднятые вручную в «Доступе»
      return perm ? perm.can_view : (MANAGER_POLICY[page] ?? 'none') !== 'none';
    }
    if (isRop && ROP_PAGES.has(page)) return true;
    const perm = permissions.find(p => p.page === page);
    if (perm) return perm.can_view;
    return !RESTRICTED_BY_DEFAULT.has(page);
  }

  function canEdit(page: string): boolean {
    if (isDirector) return true;
    if (salesPolicy) {
      if (MANAGER_LOCKED.has(page)) return false;
      const perm = permissions.find(p => p.page === page);
      return perm ? perm.can_edit : MANAGER_POLICY[page] === 'edit';
    }
    if (isDirectorView) return !DIRECTOR_ONLY_EDIT_PAGES.has(page);
    if (isRop && ROP_PAGES.has(page)) return true;
    const perm = permissions.find(p => p.page === page);
    if (perm) return perm.can_edit;
    return !RESTRICTED_BY_DEFAULT.has(page);
  }

  return (
    <AuthContext.Provider value={{
      user, profile, isAdmin, isDirector, isDirectorView, isRop, isManager, isLidorub, canApprove, canViewAllManagers, canEditAllDeals, canViewAllLeads, canEditAllLeads,
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
