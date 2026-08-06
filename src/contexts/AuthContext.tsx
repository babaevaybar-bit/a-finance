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

  const isAdmin = profile?.role === 'admin';

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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
        await loadPermissions(p?.manager_id);
      }
    }).finally(() => setLoading(false));

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
    const email = `${username.trim().toLowerCase()}@aybar.app`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: 'Неверный логин или пароль' };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setPermissions([]);
  };

  // Admin always has full access; employees follow their permission record
  // Default (no record) = can_view:true, can_edit:true
  function canView(page: string): boolean {
    if (isAdmin) return true;
    const perm = permissions.find(p => p.page === page);
    return perm ? perm.can_view : true;
  }

  function canEdit(page: string): boolean {
    if (isAdmin) return true;
    const perm = permissions.find(p => p.page === page);
    return perm ? perm.can_edit : true;
  }

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loading, permissions, canView, canEdit, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
