import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { getManagers, getAllPermissions, upsertPermission } from '@/lib/api';
import type { Manager, EmployeePermission } from '@/types/types';
import { PERMISSION_PAGES } from '@/types/types';

// ─── Типы ─────────────────────────────────────────────────────────────────────
type PermMap = Record<string, Record<string, { can_view: boolean; can_edit: boolean; can_approve: boolean }>>;

function getPerm(map: PermMap, managerId: string, page: string) {
  return map[managerId]?.[page] ?? { can_view: true, can_edit: true, can_approve: false };
}

export default function PermissionsPage() {
  const [managers, setManagers]     = useState<Manager[]>([]);
  const [permMap, setPermMap]       = useState<PermMap>({});
  const [saving, setSaving]         = useState<Record<string, boolean>>({});
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mgrs, perms] = await Promise.all([getManagers(), getAllPermissions()]);
      setManagers(mgrs);
      const map: PermMap = {};
      (perms as EmployeePermission[]).forEach(p => {
        if (!map[p.manager_id]) map[p.manager_id] = {};
        map[p.manager_id][p.page] = { can_view: p.can_view, can_edit: p.can_edit, can_approve: p.can_approve ?? false };
      });
      setPermMap(map);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(
    managerId: string,
    page: string,
    field: 'can_view' | 'can_edit' | 'can_approve',
    value: boolean
  ) {
    const key = `${managerId}:${page}:${field}`;
    setSaving(s => ({ ...s, [key]: true }));
    const current = getPerm(permMap, managerId, page);
    const next = { ...current, [field]: value };
    // Логика зависимостей
    if (field === 'can_view' && !value) { next.can_edit = false; next.can_approve = false; }
    if (field === 'can_edit' && value)  next.can_view = true;
    if (field === 'can_approve' && value) next.can_view = true;
    setPermMap(prev => ({
      ...prev,
      [managerId]: { ...(prev[managerId] ?? {}), [page]: next },
    }));
    try {
      await upsertPermission({
        manager_id: managerId, page,
        can_view: next.can_view, can_edit: next.can_edit, can_approve: next.can_approve,
      });
    } catch {
      toast.error('Ошибка сохранения');
      await load();
    } finally {
      setSaving(s => { const n = { ...s }; delete n[key]; return n; });
    }
  }

  // Дать/забрать доступ ко ВСЕМ разделам для одного сотрудника
  async function toggleAll(managerId: string, grantAll: boolean) {
    const keys = PERMISSION_PAGES.map(p => `${managerId}:${p.key}:batch`);
    const batching: Record<string, boolean> = {};
    keys.forEach(k => batching[k] = true);
    setSaving(s => ({ ...s, ...batching }));

    const nextMap: Record<string, { can_view: boolean; can_edit: boolean; can_approve: boolean }> = {};
    PERMISSION_PAGES.forEach(({ key }) => {
      nextMap[key] = { can_view: grantAll, can_edit: grantAll, can_approve: false };
    });

    setPermMap(prev => ({ ...prev, [managerId]: nextMap }));

    try {
      await Promise.all(
        PERMISSION_PAGES.map(({ key }) =>
          upsertPermission({ manager_id: managerId, page: key, can_view: grantAll, can_edit: grantAll, can_approve: false })
        )
      );
      toast.success(grantAll ? 'Доступ открыт ко всем разделам' : 'Доступ закрыт ко всем разделам');
    } catch {
      toast.error('Ошибка сохранения');
      await load();
    } finally {
      setSaving(s => { const n = { ...s }; keys.forEach(k => delete n[k]); return n; });
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ShieldCheck size={20} className="text-primary" />
            Управление доступом
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Настройте видимость разделов и права на редактирование для каждого сотрудника.
            По умолчанию все разделы открыты.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : managers.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Нет сотрудников</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {managers.map(m => {
              const managerPerms = permMap[m.id] ?? {};
              const hasRestrictions = PERMISSION_PAGES.some(({ key }) => {
                const p = getPerm(permMap, m.id, key);
                return !p.can_view || !p.can_edit;
              });
              const allGranted = PERMISSION_PAGES.every(({ key }) => {
                const p = getPerm(permMap, m.id, key);
                return p.can_view && p.can_edit;
              });
              const isBatching = PERMISSION_PAGES.some(({ key }) =>
                saving[`${m.id}:${key}:batch`]
              );

              return (
                <Card key={m.id} className="border border-border">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center gap-3 flex-wrap justify-between">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <CardTitle className="text-sm font-medium truncate">{m.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs shrink-0">{m.role || '—'}</Badge>
                        {hasRestrictions && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
                            Есть ограничения
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBatching || allGranted}
                          onClick={() => toggleAll(m.id, true)}
                          className="text-xs gap-1 h-7"
                        >
                          <Eye size={12} />
                          Открыть всё
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBatching || (!managerPerms || Object.keys(managerPerms).length === 0 ? false : !hasRestrictions && Object.values(managerPerms).every(p => !p.can_view))}
                          onClick={() => toggleAll(m.id, false)}
                          className="text-xs gap-1 h-7"
                        >
                          <EyeOff size={12} />
                          Закрыть всё
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-6 font-medium text-muted-foreground whitespace-nowrap">Раздел</th>
                            <th className="text-center py-2 px-4 font-medium text-muted-foreground whitespace-nowrap w-28">Просмотр</th>
                            <th className="text-center py-2 px-4 font-medium text-muted-foreground whitespace-nowrap w-28">Редактирование</th>
                            <th className="text-center py-2 px-4 font-medium text-muted-foreground whitespace-nowrap w-32">Подтверждение</th>
                          </tr>
                        </thead>
                        <tbody>
                          {PERMISSION_PAGES.map(({ key, label }) => {
                            const perm = getPerm(permMap, m.id, key);
                            const savingView    = saving[`${m.id}:${key}:can_view`]    || saving[`${m.id}:${key}:batch`];
                            const savingEdit    = saving[`${m.id}:${key}:can_edit`]    || saving[`${m.id}:${key}:batch`];
                            const savingApprove = saving[`${m.id}:${key}:can_approve`] || saving[`${m.id}:${key}:batch`];
                            // «Подтверждение» актуально только для раздела approvals
                            const showApprove = key === 'approvals';
                            return (
                              <tr key={key} className="border-b border-border last:border-0">
                                <td className="py-3 pr-6 whitespace-nowrap">{label}</td>
                                <td className="py-3 px-4 text-center">
                                  <Switch
                                    checked={perm.can_view}
                                    disabled={!!savingView}
                                    onCheckedChange={v => toggle(m.id, key, 'can_view', v)}
                                  />
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <Switch
                                    checked={perm.can_edit}
                                    disabled={!perm.can_view || !!savingEdit}
                                    onCheckedChange={v => toggle(m.id, key, 'can_edit', v)}
                                  />
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {showApprove ? (
                                    <Switch
                                      checked={perm.can_approve}
                                      disabled={!!savingApprove}
                                      onCheckedChange={v => toggle(m.id, key, 'can_approve', v)}
                                    />
                                  ) : (
                                    <span className="text-muted-foreground/30 text-xs">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Отключение «Просмотра» автоматически снимает и «Редактирование». Раздел пропадает из навигации сотрудника.
        </p>
      </div>
    </AppLayout>
  );
}
