import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { getPendingDeals, approveDeal, rejectDeal, getManagers } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, Manager } from '@/types/types';

export default function ApprovalsPage() {
  const [deals, setDeals]     = useState<Deal[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, mgrs] = await Promise.all([getPendingDeals(), getManagers()]);
      setDeals(pending);
      setManagers(mgrs);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function managerName(id: string) {
    return managers.find(m => m.id === id)?.name ?? '—';
  }

  async function handleApprove(id: string) {
    try {
      await approveDeal(id);
      toast.success('Сделка подтверждена');
      await load();
    } catch { toast.error('Ошибка'); }
  }

  async function handleReject(id: string) {
    try {
      await rejectDeal(id);
      toast.success('Сделка отклонена');
      await load();
    } catch { toast.error('Ошибка'); }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Подтверждение сделок</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Сделки, ожидающие вашего подтверждения
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : deals.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CheckCircle size={36} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">Нет сделок, ожидающих подтверждения</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {deals.map(d => (
              <Card key={d.id} className="border border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock size={14} className="shrink-0 text-amber-500" />
                        <span className="truncate">{managerName(d.manager_id)}</span>
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 shrink-0">
                          Ожидает
                        </Badge>
                      </CardTitle>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive border border-destructive/30">
                            <XCircle size={13} className="mr-1" />Отклонить
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Отклонить сделку?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Сделка {d.client_name ? `«${d.client_name}»` : ''} на {formatCurrency(d.total_amount)} будет отклонена.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleReject(d.id)}
                            >Отклонить</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleApprove(d.id)}
                      >
                        <CheckCircle size={13} className="mr-1" />Подтвердить
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Дата</span>
                      <p>{formatDate(d.deal_date)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Клиент</span>
                      <p className="truncate">{d.client_name || '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Сумма</span>
                      <p className="font-medium">{formatCurrency(d.total_amount)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Оплата</span>
                      <p>{d.payment_method}</p>
                    </div>
                    {d.door_model && (
                      <div className="md:col-span-2">
                        <span className="text-muted-foreground text-xs">Модель</span>
                        <p>{d.door_model}</p>
                      </div>
                    )}
                    {d.comment && (
                      <div className="md:col-span-2">
                        <span className="text-muted-foreground text-xs">Комментарий</span>
                        <p className="text-muted-foreground">{d.comment}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
