import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, Factory, CheckCheck } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { AppNotification } from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';

export default function MessagesPage() {
  const { profile, canViewAllManagers } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Директор/РОП видят уведомления всех сотрудников; остальные — только свои
      const list = await getNotifications(canViewAllManagers ? null : (profile?.manager_id ?? null));
      setItems(list);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [profile?.manager_id, canViewAllManagers]);

  useEffect(() => { load(); }, [load]);

  async function handleOpen(n: AppNotification) {
    if (!n.is_read) {
      setItems(prev => prev.map(i => i.id === n.id ? { ...i, is_read: true } : i));
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.type === 'stage_changed') navigate('/production');
    else if (n.deal_id) navigate('/sales');
  }

  async function handleMarkAllRead() {
    if (!profile?.manager_id) return;
    setItems(prev => prev.map(i => ({ ...i, is_read: true })));
    try { await markAllNotificationsRead(profile.manager_id); } catch { /* silent */ }
  }

  const unreadCount = items.filter(i => !i.is_read).length;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Сообщения</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Напоминания об оплате и изменениях в производстве{unreadCount > 0 ? ` · ${unreadCount} новых` : ''}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck size={14} className="mr-1.5" />Прочитать всё
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Пока нет сообщений</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {items.map(n => {
              const Icon = n.type === 'payment_due' ? Banknote : Factory;
              const iconColor = n.type === 'payment_due' ? 'text-amber-600' : 'text-primary';
              return (
                <Card
                  key={n.id}
                  className={`cursor-pointer transition-colors hover:border-primary/40 ${!n.is_read ? 'border-primary/40' : ''}`}
                  onClick={() => handleOpen(n)}
                >
                  <CardContent className="py-3 px-4 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${!n.is_read ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Icon size={15} className={iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${!n.is_read ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>
                        {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(n.created_at)}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
