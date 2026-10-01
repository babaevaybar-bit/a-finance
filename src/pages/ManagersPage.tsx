import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, KeyRound, Check, X, Mail, Phone, Calendar, Wallet, ShieldCheck, Layers } from 'lucide-react';
import { getManagers, createManager, updateManager, deleteManager, getSalarySettings, upsertSalarySetting, getAllProfiles, updateProfile, getAllDeals } from '@/lib/api';
import type { Profile } from '@/types/types';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Manager, SalarySetting } from '@/types/types';
import { ROLES } from '@/types/types';
import { formatCurrency, formatDate } from '@/lib/utils';

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  if (role === 'Менеджер по продажам') return 'default';
  if (['Бухгалтер', 'Управляющий'].includes(role)) return 'secondary';
  return 'outline';
}

interface SalaryRowProps {
  manager: Manager;
  setting: SalarySetting | undefined;
  onSaved: () => void;
}
function SalaryInlineRow({ manager, setting, onSaved }: SalaryRowProps) {
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState(String(setting?.base_salary ?? 0));
  const [pct, setPct] = useState(String(setting?.commission_pct ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBase(String(setting?.base_salary ?? 0));
    setPct(String(setting?.commission_pct ?? 0));
  }, [setting]);

  async function save() {
    const b = Number(base) || 0;
    const p = Number(pct) || 0;
    if (b < 0 || p < 0) { toast.error('Значения не могут быть отрицательными'); return; }
    setSaving(true);
    try {
      await upsertSalarySetting({ manager_id: manager.id, base_salary: b, commission_pct: p, use_personal_revenue: true });
      toast.success('ЗП обновлена');
      onSaved();
      setEditing(false);
    } catch { toast.error('Ошибка'); } finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
        <span>Оклад: <span className="text-foreground font-medium">{formatCurrency(Number(base))}</span></span>
        <span>·</span>
        <span>%: <span className="text-foreground font-medium">{pct}%</span></span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditing(true)}>
          <Pencil size={10} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Оклад:</span>
        <Input type="number" min="0" className="h-6 w-24 text-xs px-2" value={base} onChange={e => setBase(e.target.value)} />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">%:</span>
        <Input type="number" min="0" max="100" className="h-6 w-16 text-xs px-2" value={pct} onChange={e => setPct(e.target.value)} />
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={save} disabled={saving}><Check size={12} /></Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
        setEditing(false);
        setBase(String(setting?.base_salary ?? 0));
        setPct(String(setting?.commission_pct ?? 0));
      }}><X size={12} /></Button>
    </div>
  );
}

// Сложный случайный пароль — буквы разного регистра, цифры, спецсимвол
const SYSTEM_ROLE_LABELS: Record<string, string> = {
  director: 'Главный админ',
  director_view: 'Директор',
  rop: 'РОП',
  lidorub: 'Лидоруб',
  manager: 'Менеджер',
};

// Полный профиль сотрудника — вся информация в одном месте, а не
// разрозненно по строке списка.
function EmployeeProfileDialog({ manager, setting, profile, onClose }: {
  manager: Manager | null;
  setting?: SalarySetting;
  profile?: Profile;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<{ monthRevenue: number; monthDeals: number; totalDeals: number; debt: number } | null>(null);
  useEffect(() => {
    if (!manager) return;
    setStats(null);
    const month = new Date().toISOString().slice(0, 7);
    getAllDeals().then(all => {
      const mine = all.filter(d => d.manager_id === manager.id);
      const thisMonth = mine.filter(d => d.month_year === month);
      setStats({
        monthRevenue: thisMonth.reduce((s, d) => s + Number(d.total_amount), 0),
        monthDeals: thisMonth.length,
        totalDeals: mine.length,
        debt: mine.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0),
      });
    }).catch(() => setStats({ monthRevenue: 0, monthDeals: 0, totalDeals: 0, debt: 0 }));
  }, [manager?.id]);

  if (!manager) return null;
  return (
    <Dialog open={!!manager} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-base font-display font-bold text-primary shrink-0">
              {manager.name.trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{manager.name}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{manager.role}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {!manager.is_active && (
              <Badge variant="outline" className="text-xs border-destructive/40 text-destructive">Неактивен</Badge>
            )}
            {profile ? (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <ShieldCheck size={11} />{SYSTEM_ROLE_LABELS[profile.role] ?? profile.role}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">Без аккаунта</Badge>
            )}
            {manager.amocrm_user_id && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Layers size={11} />amoCRM
              </Badge>
            )}
          </div>

          {/* Результаты — по подтверждённым сделкам */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-muted/50 p-2.5">
              <p className="text-[11px] text-muted-foreground">Продажи за месяц</p>
              <p className="text-sm font-semibold mt-0.5">{stats ? formatCurrency(stats.monthRevenue) : '…'}</p>
              {stats && <p className="text-[11px] text-muted-foreground">{stats.monthDeals} сделок</p>}
            </div>
            <div className="rounded-xl bg-muted/50 p-2.5">
              <p className="text-[11px] text-muted-foreground">Всего сделок</p>
              <p className="text-sm font-semibold mt-0.5">{stats ? stats.totalDeals : '…'}</p>
            </div>
            <div className={`rounded-xl p-2.5 ${stats && stats.debt > 0 ? 'bg-amber-50' : 'bg-muted/50'}`}>
              <p className="text-[11px] text-muted-foreground">Клиенты должны</p>
              <p className="text-sm font-semibold mt-0.5">{stats ? formatCurrency(stats.debt) : '…'}</p>
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            {manager.phone && (
              <div className="flex items-center gap-2.5">
                <Phone size={14} className="text-muted-foreground shrink-0" />
                <span>{manager.phone}</span>
              </div>
            )}
            {profile?.email && (
              <div className="flex items-center gap-2.5">
                <Mail size={14} className="text-muted-foreground shrink-0" />
                <span className="truncate">{profile.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <Calendar size={14} className="text-muted-foreground shrink-0" />
              <span>В системе с {formatDate(manager.created_at)}</span>
            </div>
            {setting && (
              <div className="flex items-center gap-2.5">
                <Wallet size={14} className="text-muted-foreground shrink-0" />
                <span>
                  Оклад {formatCurrency(setting.base_salary)}
                  {setting.commission_pct > 0 ? ` + ${setting.commission_pct}% от выручки` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function generateStrongPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%';
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(special);
  for (let i = 0; i < 8; i++) pwd += pick(all);
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

export default function ManagersPage() {
  const { isDirector } = useAuth(); // Директор (director_view) видит страницу, но не управляет — только Главный админ
  const [managers, setManagers]     = useState<Manager[]>([]);
  const [settings, setSettings]     = useState<SalarySetting[]>([]);
  const [profiles, setProfiles]     = useState<Profile[]>([]);
  const [profileTarget, setProfileTarget] = useState<Manager | null>(null); // открытый профиль сотрудника
  // Существующий аккаунт в окне редактирования
  const [accountStatus, setAccountStatus] = useState<{ email: string; confirmed: boolean } | null | 'loading'>(null);
  const [replaceAccount, setReplaceAccount] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [newName, setNewName]       = useState('');
  const [newRole, setNewRole]       = useState<string>('Менеджер по продажам');
  const [newRoleCustom, setNewRoleCustom] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAuthRole, setNewAuthRole] = useState<'manager' | 'rop' | 'director' | 'director_view' | 'lidorub'>('manager');
  const [newRecoveryEmail, setNewRecoveryEmail] = useState('');
  const [saving, setSaving]         = useState(false);
  const [editManager, setEditManager]   = useState<Manager | null>(null);
  const [editName, setEditName]         = useState('');
  const [editRole, setEditRole]         = useState('');
  const [editRoleCustom, setEditRoleCustom] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editAuthRole, setEditAuthRole] = useState<'manager' | 'rop' | 'director' | 'director_view' | 'lidorub'>('manager');
  const [editRecoveryEmail, setEditRecoveryEmail] = useState('');
  const [editSaving, setEditSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, setts, profs] = await Promise.all([getManagers(), getSalarySettings(), getAllProfiles()]);
      setManagers(mgrs);
      setSettings(setts);
      setProfiles(profs);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Создаём auth-пользователя через Edge Function (Admin API на сервере),
  // чтобы signUp не переключал сессию текущего администратора.
  async function callEmployeeFn(body: Record<string, unknown>): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke('create-employee', {
      body,
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (res.error) {
      let msg = res.error.message;
      try { const b = await (res.error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      return { error: msg };
    }
    return res.data ?? {};
  }

  async function accountAction(action: 'resend' | 'confirm') {
    if (!editManager?.user_id || accountStatus === 'loading' || !accountStatus) return;
    setAccountBusy(true);
    const r = await callEmployeeFn({ action, userId: editManager.user_id, email: accountStatus.email });
    setAccountBusy(false);
    if (r.error) { toast.error(r.error); return; }
    if (action === 'resend') toast.success(`Письмо отправлено на ${accountStatus.email} — пусть проверит и папку «Спам»`);
    else { toast.success('Почта подтверждена — сотрудник может входить'); setAccountStatus({ ...accountStatus, confirmed: true }); }
  }

  async function createAuthUser(username: string, password: string, managerId: string, role: string, recoveryEmail: string): Promise<string | null> {
    const r = await callEmployeeFn({ username: username.trim().toLowerCase(), password, managerId, role, recoveryEmail: recoveryEmail.trim().toLowerCase() });
    if (r.error) {
      toast.error(`Аккаунт не создан: ${r.error}`);
      return null;
    }
    return r.userId ?? null;
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) { toast.error('Введите имя сотрудника'); return; }
    const role = newRole === '__custom__' ? newRoleCustom.trim() : newRole;
    if (!role) { toast.error('Введите должность'); return; }
    setSaving(true);
    try {
      // Начали заполнять аккаунт, но не до конца — не создаём молча без аккаунта
      const anyAcc = !!(newUsername.trim() || newPassword || newRecoveryEmail.trim());
      if (anyAcc && (!newUsername.trim() || newPassword.length < 6 || !/^\S+@\S+\.\S+$/.test(newRecoveryEmail.trim()))) {
        toast.error('Для аккаунта заполните все три поля: логин, пароль (мин. 6 символов) и почту');
        setSaving(false);
        return;
      }
      // Сначала создаём менеджера, чтобы получить его ID для Edge Function
      const managerId = await createManager(name, role, null);
      let userId: string | null = null;
      if (newUsername.trim() && newPassword) {
        if (!newRecoveryEmail.trim() || !/^\S+@\S+\.\S+$/.test(newRecoveryEmail.trim())) {
          toast.error('Укажите настоящую почту сотрудника — для восстановления пароля');
          await deleteManager(managerId);
          setSaving(false);
          return;
        }
        // Edge Function создаёт auth-пользователя + профиль атомарно
        userId = await createAuthUser(newUsername, newPassword, managerId, newAuthRole, newRecoveryEmail);
        if (!userId) {
          // Откатываем запись менеджера если аккаунт не создался
          await deleteManager(managerId);
          setSaving(false);
          return;
        }
        // Привязываем user_id к записи менеджера
        await updateManager(managerId, name, role, userId);
      }
      setNewName(''); setNewRole('Менеджер по продажам'); setNewRoleCustom(''); setNewUsername(''); setNewPassword('');
      toast.success(
        userId
          ? `Сотрудник «${name}» добавлен — на его почту отправлено письмо для подтверждения аккаунта`
          : `Сотрудник «${name}» добавлен`
      );
      await load();
    } catch { toast.error('Не удалось добавить'); }
    finally { setSaving(false); }
  }

  function openEdit(m: Manager) {
    setEditManager(m);
    setEditName(m.name);
    // Если роль не из стандартного списка — показываем «Другая должность» + custom поле
    const isKnownRole = (ROLES as readonly string[]).includes(m.role);
    setEditRole(isKnownRole ? m.role : '__custom__');
    setEditRoleCustom(isKnownRole ? '' : (m.role || ''));
    setEditUsername('');
    setEditPassword('');
    setEditRecoveryEmail('');
    setReplaceAccount(false);
    const prof = profiles.find(p => p.id === m.user_id);
    setEditAuthRole((prof?.role as typeof editAuthRole) ?? 'manager');
    if (m.user_id) {
      setAccountStatus('loading');
      callEmployeeFn({ action: 'status', userId: m.user_id }).then(r => {
        setAccountStatus(r.error ? null : { email: r.email, confirmed: r.confirmed });
      });
    } else {
      setAccountStatus(null);
    }
  }

  async function handleUpdate() {
    if (!editManager) return;
    const name = editName.trim();
    if (!name) { toast.error('Введите имя'); return; }
    const role = editRole === '__custom__' ? editRoleCustom.trim() : editRole;
    if (!role) { toast.error('Введите должность'); return; }

    const creatingAccount = !editManager.user_id || replaceAccount;
    const anyAccountField = !!(editUsername.trim() || editPassword || editRecoveryEmail.trim());
    if (creatingAccount && anyAccountField) {
      if (!editUsername.trim()) { toast.error('Для аккаунта заполните «Логин»'); return; }
      if (editPassword.length < 6) { toast.error('Для аккаунта заполните «Пароль» (мин. 6 символов) или нажмите «Сгенерировать»'); return; }
      if (!/^\S+@\S+\.\S+$/.test(editRecoveryEmail.trim())) { toast.error('Укажите настоящую почту сотрудника — на неё придёт письмо подтверждения'); return; }
    }

    setEditSaving(true);
    try {
      let userId = editManager.user_id;
      if (creatingAccount && anyAccountField) {
        const newUserId = await createAuthUser(editUsername, editPassword, editManager.id, editAuthRole, editRecoveryEmail);
        if (!newUserId) { setEditSaving(false); return; } // ошибка уже показана — окно не закрываем, данные не теряются
        userId = newUserId;
      } else if (editManager.user_id && !replaceAccount) {
        const prof = profiles.find(p => p.id === editManager.user_id);
        if (prof && prof.role !== editAuthRole) await updateProfile(prof.id, { role: editAuthRole });
      }
      await updateManager(editManager.id, name, role, userId);
      toast.success(creatingAccount && anyAccountField
        ? `Аккаунт создан. На ${editRecoveryEmail.trim()} отправлено письмо — сотрудник должен нажать ссылку в нём, потом сможет входить`
        : 'Данные обновлены');
      setEditManager(null);
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Не удалось обновить'); }
    finally { setEditSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    try {
      await deleteManager(id);
      toast.success(`«${name}» удалён`);
      await load();
    } catch { toast.error('Не удалось удалить'); }
  }

  const grouped = (ROLES as readonly string[]).reduce<Record<string, Manager[]>>((acc, r) => {
    acc[r] = managers.filter(m => m.role === r);
    return acc;
  }, {});
  const uncategorized = managers.filter(m => !(ROLES as readonly string[]).includes(m.role));
  if (uncategorized.length) grouped['Другое'] = uncategorized;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Сотрудники</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Управление персоналом и аккаунтами</p>
        </div>

        {isDirector && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Добавить сотрудника</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Имя *</Label>
                <Input placeholder="Имя сотрудника" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Должность *</Label>
                <Select value={newRole} onValueChange={v => { setNewRole(v); if (v !== '__custom__') setNewRoleCustom(''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    <SelectItem value="__custom__">Другая должность...</SelectItem>
                  </SelectContent>
                </Select>
                {newRole === '__custom__' && (
                  <Input
                    className="mt-1.5"
                    placeholder="Введите должность"
                    value={newRoleCustom}
                    onChange={e => setNewRoleCustom(e.target.value)}
                  />
                )}
              </div>
            </div>
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <KeyRound size={12} />Аккаунт для входа (необязательно)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Логин</Label>
                  <Input placeholder="ivan.petrov" value={newUsername} onChange={e => setNewUsername(e.target.value)} autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Пароль</Label>
                  <div className="flex gap-1.5">
                    <Input placeholder="Мин. 6 символов" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
                    <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setNewPassword(generateStrongPassword())}>
                      Сгенерировать
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">Email для восстановления пароля</Label>
                  <Input type="email" placeholder="ivan@example.com" value={newRecoveryEmail} onChange={e => setNewRecoveryEmail(e.target.value)} autoComplete="email" />
                  <p className="text-xs text-muted-foreground">Настоящая почта сотрудника — на неё придёт письмо, если он забудет пароль.</p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">Роль в системе</Label>
                  <Select value={newAuthRole} onValueChange={v => setNewAuthRole(v as typeof newAuthRole)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Менеджер — только свои клиенты и сделки</SelectItem>
                      <SelectItem value="lidorub">Лидоруб — доступ как у менеджера, ЗП от общей выручки</SelectItem>
                      <SelectItem value="rop">РОП — CRM и продажи всех менеджеров</SelectItem>
                      <SelectItem value="director_view">Директор — видит всё, но не управляет сотрудниками/правами</SelectItem>
                      <SelectItem value="director">Главный админ — полный доступ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Сотрудник сможет войти согласно выбранной роли.</p>
            </div>
            <Button onClick={handleCreate} disabled={saving || !newName.trim()} className="w-full">
              <Plus size={16} className="mr-1" />Добавить
            </Button>
          </CardContent>
        </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users size={16} />Список сотрудников
              <span className="text-muted-foreground font-normal text-sm">({managers.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
            ) : managers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Нет сотрудников. Добавьте первого выше.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(grouped).filter(([, ms]) => ms.length > 0).map(([role, ms]) => (
                  <div key={role}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{role}</p>
                    <ul className="divide-y divide-border">
                      {ms.map(m => (
                        <li key={m.id} className="flex items-start justify-between py-3 gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                className="text-sm font-medium truncate text-left hover:text-primary hover:underline"
                                onClick={() => setProfileTarget(m)}
                              >{m.name}</button>
                              <Badge variant={roleBadgeVariant(m.role)} className="text-xs shrink-0">{m.role || '—'}</Badge>
                              {m.user_id && (
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                  <KeyRound size={10} />Есть аккаунт
                                </span>
                              )}
                              {!m.is_active && (
                                <Badge variant="outline" className="text-xs shrink-0 border-destructive/40 text-destructive">Неактивен</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mt-0.5">
                              {m.phone && <span>{m.phone}</span>}
                              <span>в системе с {formatDate(m.created_at)}</span>
                              {m.amocrm_user_id && <span>привязан к amoCRM</span>}
                            </div>
                            <SalaryInlineRow manager={m} setting={settings.find(s => s.manager_id === m.id)} onSaved={load} />
                          </div>
                          {isDirector && (
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}>
                              <Pencil size={14} />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                  <Trash2 size={14} />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Удалить «{m.name}»?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Будут удалены все сделки, планы и зарплатные настройки. Действие необратимо.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDelete(m.id, m.name)}
                                  >Удалить</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editManager} onOpenChange={v => !v && setEditManager(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader><DialogTitle>Редактировать сотрудника</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Имя *</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Имя" />
              </div>
              <div className="space-y-1">
                <Label>Должность</Label>
                <Select value={editRole} onValueChange={v => { setEditRole(v); if (v !== '__custom__') setEditRoleCustom(''); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    <SelectItem value="__custom__">Другая должность...</SelectItem>
                  </SelectContent>
                </Select>
                {editRole === '__custom__' && (
                  <Input
                    className="mt-1.5"
                    placeholder="Введите должность"
                    value={editRoleCustom}
                    onChange={e => setEditRoleCustom(e.target.value)}
                  />
                )}
              </div>
            </div>
            {editManager?.user_id && !replaceAccount ? (
              <div className="rounded-md border border-border p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <KeyRound size={12} />Аккаунт для входа
                </p>
                {accountStatus === 'loading' ? (
                  <p className="text-xs text-muted-foreground">Проверяю аккаунт...</p>
                ) : accountStatus === null ? (
                  <p className="text-xs text-destructive">Аккаунт не найден — создайте новый ниже.</p>
                ) : (
                  <>
                    <div className="text-sm space-y-0.5">
                      <p>Логин: <span className="font-medium">{profiles.find(p => p.id === editManager.user_id)?.name ?? '—'}</span></p>
                      <p>Почта: <span className="font-medium">{accountStatus.email}</span></p>
                    </div>
                    {accountStatus.confirmed ? (
                      <p className="text-xs px-2 py-1 rounded-md bg-green-50 text-green-800 border border-green-200 inline-flex items-center gap-1">
                        <Check size={12} />Почта подтверждена — сотрудник может входить
                      </p>
                    ) : (
                      <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 space-y-2">
                        <p className="text-xs text-amber-800">
                          Почта ещё не подтверждена — сотрудник не сможет войти, пока не нажмёт ссылку в письме.
                          Если письма нет (проверьте «Спам»), отправьте ещё раз или подтвердите вручную.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={accountBusy}
                            onClick={() => accountAction('resend')}>Отправить письмо ещё раз</Button>
                          <Button type="button" size="sm" className="h-8 text-xs" disabled={accountBusy}
                            onClick={() => accountAction('confirm')}>Подтвердить вручную</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Роль в системе</Label>
                  <Select value={editAuthRole} onValueChange={v => setEditAuthRole(v as typeof editAuthRole)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Менеджер — только свои клиенты и сделки</SelectItem>
                      <SelectItem value="lidorub">Лидоруб — доступ как у менеджера, ЗП от общей выручки</SelectItem>
                      <SelectItem value="rop">РОП — CRM и продажи всех менеджеров</SelectItem>
                      <SelectItem value="director_view">Директор — видит всё, но не управляет сотрудниками/правами</SelectItem>
                      <SelectItem value="director">Главный админ — полный доступ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => setReplaceAccount(true)}>Создать новый аккаунт вместо этого</button>
              </div>
            ) : (
            <div className="rounded-md border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <KeyRound size={12} />{editManager?.user_id ? 'Новый аккаунт (заменит текущий)' : 'Создать аккаунт для входа'}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Логин</Label>
                  <Input placeholder="ivan.petrov" value={editUsername} onChange={e => setEditUsername(e.target.value)} autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Пароль</Label>
                  <div className="flex gap-1.5">
                    <Input placeholder="Мин. 6 символов" value={editPassword} onChange={e => setEditPassword(e.target.value)} autoComplete="new-password" />
                    <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setEditPassword(generateStrongPassword())}>
                      Сгенерировать
                    </Button>
                  </div>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">Email для восстановления пароля</Label>
                  <Input type="email" placeholder="ivan@example.com" value={editRecoveryEmail} onChange={e => setEditRecoveryEmail(e.target.value)} autoComplete="email" />
                  <p className="text-xs text-muted-foreground">Настоящая почта сотрудника — на неё придёт письмо, если он забудет пароль.</p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">Роль в системе</Label>
                  <Select value={editAuthRole} onValueChange={v => setEditAuthRole(v as typeof editAuthRole)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Менеджер — только свои клиенты и сделки</SelectItem>
                      <SelectItem value="lidorub">Лидоруб — доступ как у менеджера, ЗП от общей выручки</SelectItem>
                      <SelectItem value="rop">РОП — CRM и продажи всех менеджеров</SelectItem>
                      <SelectItem value="director_view">Директор — видит всё, но не управляет сотрудниками/правами</SelectItem>
                      <SelectItem value="director">Главный админ — полный доступ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditManager(null)}>Отмена</Button>
            <Button onClick={handleUpdate} disabled={editSaving || !editName.trim()}>
              {editSaving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmployeeProfileDialog
        manager={profileTarget}
        setting={profileTarget ? settings.find(s => s.manager_id === profileTarget.id) : undefined}
        profile={profileTarget ? profiles.find(p => p.id === profileTarget.user_id) : undefined}
        onClose={() => setProfileTarget(null)}
      />
    </AppLayout>
  );
}
