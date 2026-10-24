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
import { CheckCircle, XCircle, Clock, ShieldOff, RotateCcw, RefreshCw } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { countPendingChanges, getPendingDeals, getRejectedDeals, approveDeal, rejectDeal, restoreDeal, getManagers, notifyCountersChanged, updateDeal, getContractIndex, contractDuplicates } from '@/lib/api';
import type { ContractIndex } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, Manager } from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';
import { CHANNELS, SPLIT_PAYMENT_METHOD } from '@/types/types';
import TrelloLookup from '@/components/trello/TrelloLookup';
import ChangeRequests from '@/components/approvals/ChangeRequests';
import DealFormDialog from '@/components/sales/DealFormDialog';
import DealCompleteness from '@/components/sales/DealCompleteness';

export default function ApprovalsPage() {
  const { canApprove } = useAuth();
  const [tab, setTab] = useState<'pending' | 'rejected' | 'changes'>('pending');
  const [changesCount, setChangesCount] = useState(0);
  const [deals, setDeals]       = useState<Deal[]>([]);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading]   = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [channelPick, setChannelPick] = useState<Record<string, string>>({});
  const [contractIdx, setContractIdx] = useState<ContractIndex | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [trelloTick, setTrelloTick] = useState(0);

  // Скелетон — только при первой загрузке/смене вкладки; дальше обновляем тихо
  const load = useCallback(async (silent = false) => {
    if (!canApprove) return;
    countPendingChanges().then(setChangesCount).catch(() => {});
    if (tab === 'changes') { if (!managers.length) getManagers().then(setManagers).catch(() => {}); setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const [list, mgrs] = await Promise.all([
        tab === 'pending' ? getPendingDeals() : getRejectedDeals(),
        managers.length ? Promise.resolve(managers) : getManagers(),
      ]);
      setDeals(list);
      if (mgrs !== managers) setManagers(mgrs);
      getContractIndex().then(setContractIdx).catch(() => {});
    } catch { if (!silent) toast.error('Ошибка загрузки'); }
    finally { if (!silent) setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canApprove, tab]);

  // Убрать карточку сразу, не дожидаясь перезагрузки списка
  function dropLocally(id: string) {
    setDeals(prev => prev.filter(d => d.id !== id));
    notifyCountersChanged();
    load(true);
  }

  useEffect(() => { load(); }, [load]);

  /** Сразу подтянуть изменения из amoCRM и Trello, не дожидаясь автообновления (раз в 30 минут) */
  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    const t = toast.loading('Обновляю из amoCRM и Trello…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
      const [amo, trello] = await Promise.allSettled([
        supabase.functions.invoke('amocrm-sync-deals', { body: {}, headers }),
        supabase.functions.invoke('notify-stage-changes', { body: {}, headers }),
      ]);
      const a = amo.status === 'fulfilled' && !amo.value.error ? amo.value.data as { synced?: number; updated?: number; filled?: number } : null;
      const tr = trello.status === 'fulfilled' && !trello.value.error ? trello.value.data as { stagesUpdated?: number } : null;
      await load(true);
      setTrelloTick(x => x + 1); // открытые блоки «Данные из Trello» загрузятся заново
      notifyCountersChanged();
      setSyncedAt(new Date());
      const parts: string[] = [];
      parts.push(a ? `amoCRM: новых ${a.synced ?? 0}, обновлено ${(a.updated ?? 0) + (a.filled ?? 0)}` : 'amoCRM: не удалось обновить');
      parts.push(tr ? `Trello: этапов обновлено ${tr.stagesUpdated ?? 0}` : 'Trello: не удалось обновить');
      (a && tr ? toast.success : toast.warning)(parts.join(' · '), { id: t });
    } catch {
      toast.error('Не удалось обновить', { id: t });
    } finally { setSyncing(false); }
  }

  function managerName(id: string) {
    return managers.find(m => m.id === id)?.name ?? '—';
  }

  async function handleApprove(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const { incomeRecorded, channel } = await approveDeal(id);
      toast.success(
        incomeRecorded
          ? `Сделка подтверждена, сумма добавлена в «Финансы» (${channel})`
          : 'Сделка подтверждена — способ оплаты не привязан к конкретному каналу, добавьте поступление в «Финансы» вручную'
      );
      dropLocally(id);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setBusyId(null); }
  }

  // Выбрать банк прямо на карточке и сразу подтвердить
  async function handleSetChannelAndApprove(id: string) {
    const ch = channelPick[id];
    if (!ch || busyId) return;
    setBusyId(id);
    try { await updateDeal(id, { payment_method: ch, payment_split: null }); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Не удалось сохранить способ оплаты'); setBusyId(null); return; }
    setBusyId(null);
    await handleApprove(id);
  }

  async function handleReject(id: string) {
    if (busyId) return;
    setBusyId(id);
    try { await rejectDeal(id); toast.success('Сделка отклонена'); dropLocally(id); }
    catch { toast.error('Ошибка'); }
    finally { setBusyId(null); }
  }

  async function handleRestore(id: string) {
    if (busyId) return;
    setBusyId(id);
    try { await restoreDeal(id); toast.success('Сделка возвращена на проверку'); dropLocally(id); }
    catch { toast.error('Ошибка'); }
    finally { setBusyId(null); }
  }

  // Нет права — показываем заглушку вместо пустой страницы
  if (!canApprove) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-muted-foreground">
          <ShieldOff size={40} className="opacity-30" />
          <p className="text-sm">У вас нет доступа к подтверждению сделок</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Подтверждение сделок</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tab === 'pending' ? 'Сделки, ожидающие вашего подтверждения' : tab === 'changes' ? 'Изменения данных клиента из amoCRM и Trello — попадут в A-Finance после подтверждения' : 'Отклонённые сделки — можно вернуть на проверку'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto min-w-0">
          <div className="flex flex-col items-stretch sm:items-end flex-1 sm:flex-none">
            <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
              <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Обновляю…' : 'Обновить из CRM и Trello'}
            </Button>
            {syncedAt && <span className="text-[11px] text-muted-foreground mt-0.5">обновлено в {syncedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          <div className="tabs-scroll flex gap-1.5 rounded-lg border border-border p-1 max-w-full overflow-x-auto">
            <Button
              variant={tab === 'pending' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={() => setTab('pending')}
            >
              Ожидающие
            </Button>
            <Button
              variant={tab === 'rejected' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={() => setTab('rejected')}
            >
              Отклонённые
            </Button>
            <Button
              variant={tab === 'changes' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={() => setTab('changes')}
            >
              Изменения из CRM/Trello
              {changesCount > 0 && <span className="ml-1.5 text-[10px] px-1.5 rounded-full bg-amber-500 text-white font-semibold">{changesCount}</span>}
            </Button>
          </div>
          </div>
        </div>

        {tab === 'changes' ? (
          <ChangeRequests managerName={managerName} onCount={setChangesCount} refreshKey={trelloTick}
            onOpenDeal={async id => { const { data } = await supabase.from('deals').select('*').eq('id', id).maybeSingle(); if (data) setEditDeal(data as Deal); }} />
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : deals.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CheckCircle size={36} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">
                {tab === 'pending' ? 'Нет сделок, ожидающих подтверждения' : 'Нет отклонённых сделок'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {deals.map(d => (
              <Card key={d.id} className={`border border-border transition-opacity ${busyId === d.id ? 'opacity-60 pointer-events-none' : ''}`}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium flex flex-wrap items-center gap-2">
                        {tab === 'pending' ? (
                          <Clock size={14} className="shrink-0 text-amber-500" />
                        ) : (
                          <XCircle size={14} className="shrink-0 text-destructive" />
                        )}
                        <span className="truncate">{managerName(d.manager_id)}</span>
                        <DealCompleteness deal={d} showPercent />
                        {tab === 'pending' ? (
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 shrink-0">
                            Ожидает
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-destructive/30 text-destructive shrink-0">
                            Отклонена
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                    <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                      {tab === 'pending' ? (
                        <>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-9 sm:h-7 flex-1 sm:flex-none text-xs text-destructive hover:text-destructive border border-destructive/30">
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
                          <Button size="sm" className="h-9 sm:h-7 flex-1 sm:flex-none text-xs" disabled={busyId === d.id} onClick={() => handleApprove(d.id)}>
                            {busyId === d.id ? <Loader2 size={13} className="mr-1 animate-spin" /> : <CheckCircle size={13} className="mr-1" />}
                            {busyId === d.id ? 'Подтверждаю…' : 'Подтвердить'}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" className="h-9 sm:h-7 w-full sm:w-auto text-xs" disabled={busyId === d.id} onClick={() => handleRestore(d.id)}>
                          <RotateCcw size={13} className="mr-1" />Вернуть на проверку
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Дата</span>
                      <p>{formatDate(d.deal_date)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Клиент</span>
                      <button
                        type="button"
                        className="truncate text-primary hover:underline text-left block w-full max-w-full"
                        onClick={() => setEditDeal(d)}
                        title="Открыть сделку"
                      >
                        {d.client_name || '—'}
                      </button>
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
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">Модель</span>
                        <p>{d.door_model}</p>
                      </div>
                    )}
                    {d.comment && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">Комментарий</span>
                        <p className="text-muted-foreground break-words">{d.comment}</p>
                      </div>
                    )}
                    {Number(d.paid_amount) > 0 && !(CHANNELS as readonly string[]).includes(d.payment_method) && !(d.payment_method === SPLIT_PAYMENT_METHOD && (d.payment_split?.length ?? 0) > 1) && (
                      <div className="col-span-2 md:col-span-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3">
                          <span>Не указан способ оплаты предоплаты {formatCurrency(d.paid_amount)} — выберите банк, и сделку можно подтвердить.</span>
                          <button type="button" className="underline shrink-0 self-start sm:self-auto" onClick={() => setEditDeal(d)}>
                            Несколько способов…
                          </button>
                        </div>
                        {tab === 'pending' && (
                          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                            <Select value={channelPick[d.id] ?? ''} onValueChange={v => setChannelPick(p => ({ ...p, [d.id]: v }))}>
                              <SelectTrigger className="h-9 sm:h-8 w-full sm:w-48 bg-background text-xs"><SelectValue placeholder="Выберите способ оплаты" /></SelectTrigger>
                              <SelectContent>
                                {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-9 sm:h-8 w-full sm:w-auto text-xs" disabled={!channelPick[d.id] || busyId === d.id} onClick={() => handleSetChannelAndApprove(d.id)}>
                              {busyId === d.id ? <Loader2 size={13} className="mr-1 animate-spin" /> : <CheckCircle size={13} className="mr-1" />}
                              Сохранить и подтвердить
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    {(() => {
                      const dups = contractDuplicates(contractIdx, d.id, d.contract_number);
                      if (!dups.length) return null;
                      return (
                        <div className="col-span-2 md:col-span-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                          Договор №{d.contract_number} уже указан у: {dups.map(x => x.client_name || 'без имени').join(', ')}. Проверьте номер — иначе сверка с Trello может перепутать клиентов.
                        </div>
                      );
                    })()}
                    <div className="col-span-2 md:col-span-4 mt-1">
                      <TrelloLookup refreshKey={trelloTick} phone={d.client_phone} contractNumber={d.contract_number} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      {editDeal && (
        <DealFormDialog
          open={!!editDeal}
          deal={editDeal}
          managerId={editDeal.manager_id}
          monthYear={editDeal.month_year}
          onClose={() => setEditDeal(null)}
          onSaved={() => { setEditDeal(null); load(true); }}
        />
      )}
    </AppLayout>
  );
}
