import React, { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Phone, MapPin, Flame, Thermometer, Snowflake, Plus, Trash2,
  CheckSquare, Square, Calendar, Clock, MessageSquare, PhoneCall,
  Users, FileText, History, X,
} from 'lucide-react';
import {
  getClientInteractions, addClientInteraction, deleteClientInteraction,
  getClientTasks, upsertClientTask, deleteClientTask,
  getClientChangeLog, createDealAndGetId, linkClientReportToDeal, getDealById,
} from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type {
  ClientReport, ClientInteraction, ClientTask, ClientChangeLog,
  InteractionType, Manager, Deal,
} from '@/types/types';
import {
  CLIENT_QUALITY_LABELS, DEAL_STAGE_LABELS, LEAD_SOURCE_LABELS,
  INTERACTION_TYPE_LABELS, CONTACT_TYPE_LABELS, PAYMENT_METHODS,
} from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';

// ─── helpers ──────────────────────────────────────────────────────────────────
const QUALITY_COLORS: Record<string, string> = {
  cold: 'bg-blue-50 text-blue-700 border-blue-200',
  warm: 'bg-amber-50 text-amber-700 border-amber-200',
  hot:  'bg-red-50 text-red-700 border-red-200',
};
const QUALITY_ICONS: Record<string, React.ReactNode> = {
  cold: <Snowflake size={11} />,
  warm: <Thermometer size={11} />,
  hot:  <Flame size={11} />,
};
const STAGE_COLORS: Record<string, string> = {
  new:         'bg-muted text-muted-foreground border-border',
  negotiation: 'bg-blue-50 text-blue-700 border-blue-200',
  viewing:     'bg-purple-50 text-purple-700 border-purple-200',
  offer:       'bg-amber-50 text-amber-700 border-amber-200',
  closed:      'bg-green-50 text-green-700 border-green-200',
  rejected:    'bg-red-50 text-red-700 border-red-200',
};
const INTERACTION_ICONS: Record<InteractionType, React.ReactNode> = {
  call:    <PhoneCall size={13} />,
  meeting: <Users size={13} />,
  message: <MessageSquare size={13} />,
  comment: <FileText size={13} />,
};

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  client: ClientReport | null;
  open: boolean;
  onClose: () => void;
  managers: Manager[];
  onClientUpdated: () => void;
}

export default function ClientCard({ client, open, onClose, managers, onClientUpdated }: Props) {
  const { user } = useAuth();

  const [interactions, setInteractions] = useState<ClientInteraction[]>([]);
  const [tasks,        setTasks]        = useState<ClientTask[]>([]);
  const [changelog,    setChangelog]    = useState<ClientChangeLog[]>([]);
  const [loadingCrm,   setLoadingCrm]   = useState(false);

  // New interaction form
  const [iType,    setIType]    = useState<InteractionType>('comment');
  const [iContent, setIContent] = useState('');
  const [iDate,    setIDate]    = useState(new Date().toISOString().slice(0, 16));
  const [iSaving,  setISaving]  = useState(false);

  // New task form
  const [taskTitle,  setTaskTitle]  = useState('');
  const [taskDue,    setTaskDue]    = useState('');
  const [taskSaving, setTaskSaving] = useState(false);

  // Tags
  const [tagInput, setTagInput] = useState('');

  // ── Связь со сделкой в «Продажи» ─────────────────────────────────────────────
  const [linkedDeal, setLinkedDeal] = useState<Deal | null>(null);
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [dealManagerId, setDealManagerId] = useState('');
  const [dealPaymentMethod, setDealPaymentMethod] = useState('Kaspi Bank');
  const [dealAmount, setDealAmount] = useState(0);
  const [creatingDeal, setCreatingDeal] = useState(false);

  const loadCrm = useCallback(async () => {
    if (!client) return;
    setLoadingCrm(true);
    try {
      const [ints, tks, log] = await Promise.all([
        getClientInteractions(client.id),
        getClientTasks(client.id),
        getClientChangeLog(client.id),
      ]);
      setInteractions(ints); setTasks(tks); setChangelog(log);
    } catch { /* silent */ }
    finally { setLoadingCrm(false); }
  }, [client]);

  useEffect(() => { if (open) loadCrm(); }, [open, loadCrm]);

  // Подгружаем связанную сделку, если клиент уже привязан к «Продажи»
  useEffect(() => {
    if (open && client?.deal_id) {
      getDealById(client.deal_id).then(setLinkedDeal).catch(() => setLinkedDeal(null));
    } else {
      setLinkedDeal(null);
    }
  }, [open, client?.deal_id]);

  useEffect(() => {
    if (client) {
      setDealAmount(client.deal_amount || 0);
      setShowCreateDeal(false);
    }
  }, [client?.id]);

  async function handleCreateDeal() {
    if (!client) return;
    if (!dealManagerId) { toast.error('Выберите менеджера'); return; }
    if (dealAmount <= 0) { toast.error('Укажите сумму больше 0'); return; }
    setCreatingDeal(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const dealId = await createDealAndGetId({
        manager_id: dealManagerId,
        month_year: today.slice(0, 7),
        deal_date: today,
        client_phone: client.client_phone || null,
        address: client.address || null,
        client_name: client.client_name || null,
        payment_method: dealPaymentMethod,
        door_model: null,
        total_amount: dealAmount,
        paid_amount: 0,
        prepayment_date: null,
        comment: `Создано из карточки клиента «Ежедневного отчёта» (${client.client_name}).`,
        salary_amount: null,
        vat_gross_amount: null,
        contract_number: null,
        status: 'pending',
        stage: 'new',
      });
      await linkClientReportToDeal(client.id, dealId);
      const deal = await getDealById(dealId);
      setLinkedDeal(deal);
      setShowCreateDeal(false);
      onClientUpdated();
      toast.success('Сделка создана и отправлена на подтверждение');
    } catch { toast.error('Ошибка при создании сделки'); }
    finally { setCreatingDeal(false); }
  }

  // ── Add interaction ──────────────────────────────────────────────────────────
  async function handleAddInteraction() {
    if (!client || !iContent.trim()) return;
    setISaving(true);
    try {
      await addClientInteraction({
        client_id: client.id, author_id: user?.id ?? null,
        interaction_type: iType, content: iContent.trim(),
        interacted_at: new Date(iDate).toISOString(),
      });
      setIContent(''); setIDate(new Date().toISOString().slice(0, 16));
      await loadCrm();
      toast.success('Добавлено');
    } catch { toast.error('Ошибка'); }
    finally { setISaving(false); }
  }

  // ── Add task ─────────────────────────────────────────────────────────────────
  async function handleAddTask() {
    if (!client || !taskTitle.trim()) return;
    setTaskSaving(true);
    try {
      await upsertClientTask({
        client_id: client.id, assigned_to: user?.id ?? null,
        title: taskTitle.trim(), due_date: taskDue || null, is_done: false,
      });
      setTaskTitle(''); setTaskDue('');
      await loadCrm();
      toast.success('Задача добавлена');
    } catch { toast.error('Ошибка'); }
    finally { setTaskSaving(false); }
  }

  async function toggleTask(t: ClientTask) {
    try {
      await upsertClientTask({ ...t, is_done: !t.is_done });
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_done: !x.is_done } : x));
    } catch { toast.error('Ошибка'); }
  }

  if (!client) return null;

  const managerName = managers.find(m => m.user_id === client.manager_id)?.name ?? '—';
  const openTasks   = tasks.filter(t => !t.is_done);
  const doneTasks   = tasks.filter(t => t.is_done);

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-2xl p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-lg font-semibold truncate">{client.client_name}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${QUALITY_COLORS[client.client_quality]}`}>
                  {QUALITY_ICONS[client.client_quality]}
                  {CLIENT_QUALITY_LABELS[client.client_quality]}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs border font-medium ${STAGE_COLORS[client.deal_stage]}`}>
                  {DEAL_STAGE_LABELS[client.deal_stage]}
                </span>
                {client.is_deal_closed && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200 font-medium">
                    ✓ Сделка закрыта
                  </span>
                )}
                {openTasks.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                    ⏰ {openTasks.length} задач
                  </span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </SheetHeader>

        <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-5 mt-3 shrink-0 justify-start bg-muted/50 w-auto">
            <TabsTrigger value="info"    className="text-xs">Инфо</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">История</TabsTrigger>
            <TabsTrigger value="tasks"   className="text-xs">
              Задачи {openTasks.length > 0 && <span className="ml-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{openTasks.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="log"     className="text-xs">Лог</TabsTrigger>
          </TabsList>

          {/* ── Инфо ─────────────────────────────────────────────────────────── */}
          <TabsContent value="info" className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Контакт */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Контакт</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="Телефон">
                  {client.client_phone
                    ? <a href={`tel:${client.client_phone}`} className="flex items-center gap-1 text-primary hover:underline"><Phone size={12} />{client.client_phone}</a>
                    : <Dash />}
                </Row>
                <Row label="Менеджер">{managerName}</Row>
                <Row label="Дата">{fmt(client.report_date)}</Row>
                <Row label="Тип контакта">{client.contact_type ? CONTACT_TYPE_LABELS[client.contact_type] : <Dash />}</Row>
                <Row label="Источник лида">{LEAD_SOURCE_LABELS[client.lead_source] ?? client.lead_source ?? <Dash />}</Row>
                <Row label="Канал">{client.source || <Dash />}</Row>
              </div>
            </section>
            <Separator />
            {/* Объект */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Объект</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="Адрес / ЖК">
                  {client.address
                    ? <span className="flex items-center gap-1"><MapPin size={12} />{client.address}</span>
                    : <Dash />}
                </Row>
                <Row label="Тип">{client.property_type || <Dash />}</Row>
                <Row label="Площадь">{client.area_sqm ? `${client.area_sqm} м²` : <Dash />}</Row>
                <Row label="Бюджет">{client.budget ? formatCurrency(client.budget) : <Dash />}</Row>
              </div>
            </section>
            <Separator />
            {/* Сделка */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Сделка</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row label="Сумма">{client.deal_amount > 0 ? formatCurrency(client.deal_amount) : <Dash />}</Row>
                <Row label="Следующий шаг">{client.next_action || <Dash />}</Row>
                <Row label="Дата шага">{fmt(client.next_action_date)}</Row>
              </div>
              {client.comment && (
                <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                  {client.comment}
                </div>
              )}

              {/* Связь с реальной сделкой в «Продажи» — одна карточка клиента,
                  а не два независимых ввода данных */}
              {linkedDeal ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <div className="text-sm">
                    <span className="font-medium text-green-800">Привязана к «Продажи»</span>
                    <span className="text-green-700 ml-2">
                      {formatCurrency(linkedDeal.total_amount)} ·{' '}
                      {linkedDeal.status === 'pending' ? 'на проверке' : linkedDeal.status === 'approved' ? 'подтверждена' : 'отклонена'}
                    </span>
                  </div>
                </div>
              ) : client.is_deal_closed && !showCreateDeal ? (
                <Button size="sm" variant="outline" className="h-8 text-xs w-full" onClick={() => setShowCreateDeal(true)}>
                  Создать сделку в «Продажи»
                </Button>
              ) : client.is_deal_closed && showCreateDeal ? (
                <div className="rounded-lg border border-border p-3 space-y-2.5">
                  <p className="text-xs text-muted-foreground">Сделка появится в «Подтверждениях» — сумма и оплата будут проверены директором.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Менеджер</Label>
                      <Select value={dealManagerId} onValueChange={setDealManagerId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Выберите" /></SelectTrigger>
                        <SelectContent>
                          {managers.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Способ оплаты</Label>
                      <Select value={dealPaymentMethod} onValueChange={setDealPaymentMethod}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Сумма</Label>
                      <Input type="number" className="h-8 text-xs" value={dealAmount} onChange={e => setDealAmount(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreateDeal(false)}>Отмена</Button>
                    <Button size="sm" className="h-7 text-xs" disabled={creatingDeal} onClick={handleCreateDeal}>Создать</Button>
                  </div>
                </div>
              ) : null}
            </section>
            {/* Теги */}
            {(client.tags?.length > 0 || true) && (
              <>
                <Separator />
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Теги</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(client.tags ?? []).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                    {(client.tags ?? []).length === 0 && <span className="text-sm text-muted-foreground">—</span>}
                  </div>
                </section>
              </>
            )}
          </TabsContent>

          {/* ── История ──────────────────────────────────────────────────────── */}
          <TabsContent value="history" className="flex-1 flex flex-col min-h-0 px-5 py-4 gap-4">
            {/* Форма добавления */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-2 shrink-0">
              <div className="flex gap-2">
                <Select value={iType} onValueChange={v => setIType(v as InteractionType)}>
                  <SelectTrigger className="h-8 text-xs w-32 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(INTERACTION_TYPE_LABELS) as [InteractionType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="datetime-local" value={iDate} onChange={e => setIDate(e.target.value)}
                  className="h-8 text-xs flex-1 min-w-0" />
              </div>
              <Textarea rows={2} placeholder="Описание взаимодействия…" value={iContent}
                onChange={e => setIContent(e.target.value)} className="text-sm resize-none" />
              <Button size="sm" onClick={handleAddInteraction} disabled={iSaving || !iContent.trim()} className="h-7 text-xs">
                <Plus size={12} className="mr-1" />{iSaving ? 'Сохранение…' : 'Добавить'}
              </Button>
            </div>

            {/* Список */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {loadingCrm ? (
                <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
              ) : interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">История пуста</p>
              ) : interactions.map(it => (
                <div key={it.id} className="flex items-start gap-2 p-3 rounded-lg border border-border bg-card group">
                  <div className="mt-0.5 text-muted-foreground shrink-0">{INTERACTION_ICONS[it.interaction_type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{INTERACTION_TYPE_LABELS[it.interaction_type]}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock size={10} />{fmtTime(it.interacted_at)}
                      </span>
                    </div>
                    <p className="text-sm mt-0.5 break-words">{it.content}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                        <Trash2 size={11} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                      <AlertDialogHeader><AlertDialogTitle>Удалить запись?</AlertDialogTitle></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteClientInteraction(it.id).then(loadCrm).catch(() => toast.error('Ошибка'))}>Удалить</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Задачи ───────────────────────────────────────────────────────── */}
          <TabsContent value="tasks" className="flex-1 flex flex-col min-h-0 px-5 py-4 gap-4">
            {/* Форма */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-2 shrink-0">
              <Input placeholder="Название задачи (перезвонить, показ…)" value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)} className="text-sm" />
              <div className="flex gap-2 items-center">
                <Label className="text-xs shrink-0 text-muted-foreground flex items-center gap-1"><Calendar size={11} />Дата</Label>
                <Input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="h-8 text-xs flex-1" />
                <Button size="sm" onClick={handleAddTask} disabled={taskSaving || !taskTitle.trim()} className="h-8 text-xs shrink-0">
                  <Plus size={12} className="mr-1" />{taskSaving ? '…' : 'Добавить'}
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {loadingCrm ? (
                <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}</div>
              ) : tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Задач нет</p>
              ) : (
                <>
                  {openTasks.map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={id => deleteClientTask(id).then(loadCrm).catch(() => toast.error('Ошибка'))} />)}
                  {doneTasks.length > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground pt-2 pb-1 font-medium">Выполненные</p>
                      {doneTasks.map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={id => deleteClientTask(id).then(loadCrm).catch(() => toast.error('Ошибка'))} />)}
                    </>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Лог изменений ────────────────────────────────────────────────── */}
          <TabsContent value="log" className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {loadingCrm ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
            ) : changelog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Изменений нет</p>
            ) : (
              <div className="space-y-1">
                {changelog.map(log => (
                  <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    <History size={13} className="mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-medium">{log.field_name}</span>
                      {': '}
                      <span className="line-through text-muted-foreground">{log.old_value ?? '—'}</span>
                      {' → '}
                      <span className="font-medium">{log.new_value ?? '—'}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{fmtTime(log.changed_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ── Вспомогательные компоненты ────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium mt-0.5">{children}</p>
    </div>
  );
}
function Dash() { return <span className="text-muted-foreground font-normal">—</span>; }

function TaskRow({ task, onToggle, onDelete }: { task: ClientTask; onToggle: (t: ClientTask) => void; onDelete: (id: string) => void }) {
  const overdue = !task.is_done && task.due_date && new Date(task.due_date) < new Date();
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg border group ${task.is_done ? 'bg-muted/20 border-border opacity-60' : overdue ? 'border-red-200 bg-red-50/30' : 'border-border bg-card'}`}>
      <button onClick={() => onToggle(task)} className="shrink-0 text-muted-foreground hover:text-primary">
        {task.is_done ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${task.is_done ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
        {task.due_date && (
          <p className={`text-xs flex items-center gap-1 mt-0.5 ${overdue ? 'text-red-600' : 'text-muted-foreground'}`}>
            <Calendar size={10} />{new Date(task.due_date).toLocaleDateString('ru-RU')}
            {overdue && ' — просрочено'}
          </p>
        )}
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
            <Trash2 size={11} />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader><AlertDialogTitle>Удалить задачу?</AlertDialogTitle>
            <AlertDialogDescription>«{task.title}»</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(task.id)}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
