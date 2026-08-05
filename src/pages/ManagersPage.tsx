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
import { Plus, Pencil, Trash2, Users, KeyRound, Check, X } from 'lucide-react';
import { getManagers, createManager, updateManager, deleteManager, getSalarySettings, upsertSalarySetting } from '@/lib/api';
import { supabase } from '@/db/supabase';
import type { Manager, SalarySetting } from '@/types/types';
import { ROLES } from '@/types/types';
import { formatCurrency } from '@/lib/utils';

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

export default function ManagersPage() {
  const [managers, setManagers]     = useState<Manager[]>([]);
  const [settings, setSettings]     = useState<SalarySetting[]>([]);
  const [loading, setLoading]       = useState(true);
  const [newName, setNewName]       = useState('');
  const [newRole, setNewRole]       = useState<string>(ROLES[0]);
  const [newRoleCustom, setNewRoleCustom] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving]         = useState(false);
  const [editManager, setEditManager]   = useState<Manager | null>(null);
  const [editName, setEditName]         = useState('');
  const [editRole, setEditRole]         = useState('');
  const [editRoleCustom, setEditRoleCustom] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editSaving, setEditSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, setts] = await Promise.all([getManagers(), getSalarySettings()]);
      setManagers(mgrs);
      setSettings(setts);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createAuthUser(username: string, password: string): Promise<string | null> {
    const email = `${username.trim().toLowerCase()}@aybar.app`;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { toast.error(`Ошибка создания аккаунта: ${error.message}`); return null; }
    return data.user?.id ?? null;
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) { toast.error('Введите имя сотрудника'); return; }
    // Если выбрана "Другая должность" — берём из поля ввода
    const role = newRole === '__custom__' ? newRoleCustom.trim() : newRole;
    if (!role) { toast.error('Введите должность'); return; }
    setSaving(true);
    try {
      let userId: string | null = null;
      if (newUsername.trim() && newPassword) {
        userId = await createAuthUser(newUsername, newPassword);
        if (!userId) { setSaving(false); return; }
      }
      const managerId = await createManager(name, role, userId);
      if (userId) {
        const { error: profErr } = await supabase.from('profiles').insert({
          id: userId,
          username: newUsername.trim().toLowerCase(),
          role: 'employee',
          manager_id: managerId,
        });
        if (profErr) toast.warning('Аккаунт создан, но профиль не сохранился');
      }
      setNewName(''); setNewRole(ROLES[0]); setNewRoleCustom(''); setNewUsername(''); setNewPassword('');
      toast.success(`Сотрудник «${name}» добавлен${userId ? ' с аккаунтом' : ''}`);
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
  }

  async function handleUpdate() {
    if (!editManager) return;
    const name = editName.trim();
    if (!name) { toast.error('Введите имя'); return; }
    const role = editRole === '__custom__' ? editRoleCustom.trim() : editRole;
    if (!role) { toast.error('Введите должность'); return; }
    setEditSaving(true);
    try {
      let userId = editManager.user_id;
      if (editUsername.trim() && editPassword) {
        const newUserId = await createAuthUser(editUsername, editPassword);
        if (newUserId) {
          userId = newUserId;
          const { error: profErr } = await supabase.from('profiles').insert({
            id: newUserId,
            username: editUsername.trim().toLowerCase(),
            role: 'employee',
            manager_id: editManager.id,
          });
          if (profErr) toast.warning('Аккаунт создан, но профиль не сохранился');
        }
      }
      await updateManager(editManager.id, name, role, userId);
      toast.success('Данные обновлены');
      setEditManager(null);
      await load();
    } catch { toast.error('Не удалось обновить'); }
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
                  <Input type="password" placeholder="Мин. 6 символов" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Сотрудник сможет войти и добавлять свои сделки.</p>
            </div>
            <Button onClick={handleCreate} disabled={saving || !newName.trim()} className="w-full">
              <Plus size={16} className="mr-1" />Добавить
            </Button>
          </CardContent>
        </Card>

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
                              <p className="text-sm font-medium truncate">{m.name}</p>
                              <Badge variant={roleBadgeVariant(m.role)} className="text-xs shrink-0">{m.role || '—'}</Badge>
                              {m.user_id && (
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                  <KeyRound size={10} />Есть аккаунт
                                </span>
                              )}
                            </div>
                            <SalaryInlineRow manager={m} setting={settings.find(s => s.manager_id === m.id)} onSaved={load} />
                          </div>
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
                  <Input type="password" placeholder="Мин. 6 символов" value={editPassword} onChange={e => setEditPassword(e.target.value)} autoComplete="new-password" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditManager(null)}>Отмена</Button>
            <Button onClick={handleUpdate} disabled={editSaving || !editName.trim()}>
              {editSaving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
