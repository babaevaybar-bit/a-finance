import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Phone, MessageCircle, Trophy, XCircle, Check, Plus, Trash2, CalendarClock, StickyNote, ArrowRight,
  UserRound, Sparkles, Pencil, ExternalLink, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Manager } from '@/types/types';
import {
  type CrmLead, type CrmStage, type CrmTask, type CrmEvent, type TaskKind,
  getLead, updateLead, getEvents, addNote, addEvent, getTasks, createTask, completeTask, deleteTask, winLead,
  TASK_KINDS, taskKindLabel, SOURCES, dueLabel, isOverdue, normPhone, showPhone, daysOnStage,
} from '@/lib/crm';
import { formatCurrency } from '@/lib/utils';

const field = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const time = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qyzylorda' });

/** Дата-время по умолчанию для новой задачи: завтра 10:00 (по Шымкенту) */
function defaultDue() {
  const d = new Date(Date.now() + 86400000);
  const day = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Qyzylorda' });
  return `${day}T10:00`;
}
/** «2026-10-26T10:00» по Шымкенту → ISO */
const kzLocalToIso = (v: string) => new Date(`${v}:00+05:00`).toISOString();

const EVENT_ICON: Record<string, React.ElementType> = {
  created: Sparkles, note: StickyNote, stage: ArrowRight, task: CalendarClock, task_done: Check,
  won: Trophy, lost: XCircle, edit: Pencil,
};

export default function LeadSheet({ leadId, stages, lostReasons, managers, onClose, onChanged }: {
  leadId: string | null;
  stages: CrmStage[];
  lostReasons: string[];
  managers: Manager[];
  onClose: () => void;
  onChanged: (l: CrmLead) => void;
}) {
  const { profile, canViewAllManagers } = useAuth();
  const me = profile?.name && profile.name !== 'admin' ? profile.name : (profile?.email ?? null);
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [events, setEvents] = useState<CrmEvent[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [edit, setEdit] = useState<Partial<CrmLead> | null>(null);
  const [note, setNote] = useState('');
  const [taskForm, setTaskForm] = useState<{ kind: TaskKind; title: string; due: string } | null>(null);
  const [doneTask, setDoneTask] = useState<{ task: CrmTask; result: string; next: boolean } | null>(null);
  const [win, setWin] = useState<{ amount: string; paid: string; contract: string; door: string } | null>(null);
  const [lost, setLost] = useState<{ reason: string; comment: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    try {
      const [l, ev, ts] = await Promise.all([getLead(leadId), getEvents(leadId), getTasks({ leadId })]);
      setLead(l); setEvents(ev); setTasks(ts);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось загрузить'); }
  }, [leadId]);
  useEffect(() => { setLead(null); setEdit(null); setNote(''); setTaskForm(null); if (leadId) load(); }, [leadId, load]);

  const stage = stages.find(s => s.id === lead?.stage_id);
  const pipeStages = useMemo(() => stages.filter(s => s.pipeline_id === lead?.pipeline_id), [stages, lead?.pipeline_id]);
  const openTasks = tasks.filter(t => !t.done_at);
  const doneTasks = tasks.filter(t => t.done_at);
  const managerName = (id: string | null) => managers.find(m => m.id === id)?.name ?? '—';
  const closed = stage?.kind === 'won' || stage?.kind === 'lost';

  async function patch(p: Partial<CrmLead>, msg?: string) {
    if (!lead) return;
    setBusy(true);
    try {
      const l = await updateLead(lead.id, p);
      setLead(l); onChanged(l);
      if (msg) toast.success(msg);
      setEvents(await getEvents(lead.id));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  }

  function moveTo(s: CrmStage) {
    if (!lead || s.id === lead.stage_id) return;
    if (s.kind === 'won') { setWin({ amount: lead.amount ? String(lead.amount) : '', paid: '', contract: '', door: '' }); return; }
    if (s.kind === 'lost') { setLost({ reason: '', comment: '' }); return; }
    patch({ stage_id: s.id });
  }

  async function saveEdit() {
    if (!edit) return;
    if (!String(edit.client_name ?? '').trim()) { toast.error('Укажите имя клиента'); return; }
    const p: Partial<CrmLead> = { ...edit, client_phone: edit.client_phone ? normPhone(edit.client_phone) : null, amount: Number(edit.amount) || 0 };
    await patch(p, 'Сохранено');
    setEdit(null);
  }

  async function sendNote() {
    if (!lead || !note.trim()) return;
    try { await addNote(lead.id, note.trim(), me); setNote(''); setEvents(await getEvents(lead.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
  }

  async function saveTask() {
    if (!lead || !taskForm) return;
    const title = taskForm.title.trim() || taskKindLabel(taskForm.kind);
    try {
      await createTask({ lead_id: lead.id, manager_id: lead.manager_id, kind: taskForm.kind, title, due_at: kzLocalToIso(taskForm.due) });
      await addEvent(lead.id, 'task', `Задача: ${title} — ${dueLabel(kzLocalToIso(taskForm.due))}`, me);
      setTaskForm(null);
      const [ts, ev] = await Promise.all([getTasks({ leadId: lead.id }), getEvents(lead.id)]);
      setTasks(ts); setEvents(ev);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
  }

  async function finishTask() {
    if (!lead || !doneTask) return;
    try {
      await completeTask(doneTask.task.id, doneTask.result.trim() || null);
      await addEvent(lead.id, 'task_done', `Выполнено: ${doneTask.task.title}${doneTask.result.trim() ? ` — ${doneTask.result.trim()}` : ''}`, me);
      const next = doneTask.next;
      setDoneTask(null);
      const [ts, ev] = await Promise.all([getTasks({ leadId: lead.id }), getEvents(lead.id)]);
      setTasks(ts); setEvents(ev);
      if (next) setTaskForm({ kind: 'call', title: '', due: defaultDue() });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
  }

  async function confirmWin() {
    if (!lead || !win) return;
    const amount = Number(win.amount.replace(/\s/g, ''));
    if (!amount) { toast.error('Укажите сумму сделки'); return; }
    setBusy(true);
    try {
      await winLead(lead.id, amount, Number(win.paid.replace(/\s/g, '')) || 0, win.contract.trim() || null, win.door.trim() || null);
      toast.success('Сделка отправлена в «Подтверждения»');
      setWin(null);
      await load();
      const l = await getLead(lead.id); if (l) onChanged(l);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  }

  async function confirmLost() {
    if (!lead || !lost) return;
    if (!lost.reason) { toast.error('Выберите причину отказа'); return; }
    const lostStage = pipeStages.find(s => s.kind === 'lost');
    if (!lostStage) return;
    await patch({ stage_id: lostStage.id, lost_reason: lost.reason }, 'Лид закрыт');
    await addEvent(lead.id, 'lost', `Отказ: ${lost.reason}${lost.comment.trim() ? ` — ${lost.comment.trim()}` : ''}`, me);
    setLost(null);
    setEvents(await getEvents(lead.id));
  }

  const phoneDigits = lead?.client_phone?.replace(/\D/g, '') ?? '';

  return (
    <Sheet open={!!leadId} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden">
        {!lead ? (
          <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : (<>
          {/* Шапка */}
          <div className="px-5 pt-5 pb-4 border-b space-y-3 shrink-0">
            <div className="pr-8">
              <SheetTitle className="text-lg leading-tight">{lead.client_name}</SheetTitle>
              <SheetDescription className="mt-0.5">
                {[showPhone(lead.client_phone), lead.source, formatCurrency(lead.amount)].filter(Boolean).join(' · ')}
              </SheetDescription>
            </div>
            {/* Этапы — тапом переносим лид */}
            <div className="flex gap-1 overflow-x-auto tabs-scroll pb-1 -mx-1 px-1">
              {pipeStages.map(s => {
                const active = s.id === lead.stage_id;
                return (
                  <button key={s.id} type="button" disabled={busy} onClick={() => moveTo(s)}
                    className={`shrink-0 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${active ? 'text-white border-transparent' : 'bg-background hover:bg-muted text-muted-foreground'}`}
                    style={active ? { background: s.color } : { borderColor: `${s.color}66` }}>
                    {s.name}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {phoneDigits && <>
                <Button asChild size="sm" variant="outline" className="h-9"><a href={`tel:+${phoneDigits.length === 10 ? '7' + phoneDigits : phoneDigits}`}><Phone size={14} className="mr-1.5" />Позвонить</a></Button>
                <Button asChild size="sm" variant="outline" className="h-9"><a href={`https://wa.me/${phoneDigits.length === 10 ? '7' + phoneDigits : phoneDigits}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} className="mr-1.5" />WhatsApp</a></Button>
              </>}
              {!closed && <>
                <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700" onClick={() => setWin({ amount: lead.amount ? String(lead.amount) : '', paid: '', contract: '', door: '' })}><Trophy size={14} className="mr-1.5" />Успешно</Button>
                <Button size="sm" variant="outline" className="h-9 text-destructive border-destructive/30 hover:text-destructive" onClick={() => setLost({ reason: '', comment: '' })}><XCircle size={14} className="mr-1.5" />Отказ</Button>
              </>}
            </div>
            {stage?.kind === 'lost' && lead.lost_reason && <p className="text-xs text-destructive">Причина отказа: {lead.lost_reason}</p>}
            {lead.deal_id && <a href="/approvals" className="text-xs text-primary inline-flex items-center gap-1 hover:underline"><ExternalLink size={12} />Сделка отправлена в «Подтверждения»</a>}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
            {/* Задачи */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Задачи</h3>
                {!taskForm && <Button size="sm" variant="ghost" className="h-8 text-primary" onClick={() => setTaskForm({ kind: 'call', title: '', due: defaultDue() })}><Plus size={14} className="mr-1" />Задача</Button>}
              </div>
              {!openTasks.length && !taskForm && !closed && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-center gap-1.5">
                  <AlertTriangle size={13} />Нет следующего шага — поставьте задачу, чтобы клиент не потерялся
                </p>
              )}
              {openTasks.map(t => (
                <div key={t.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isOverdue(t) ? 'border-red-200 bg-red-50/60' : ''}`}>
                  <button type="button" onClick={() => setDoneTask({ task: t, result: '', next: true })} aria-label="Выполнено"
                    className="h-6 w-6 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-600 hover:bg-emerald-50 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className={`text-xs ${isOverdue(t) ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{taskKindLabel(t.kind)} · {dueLabel(t.due_at)}{isOverdue(t) ? ' · просрочено' : ''}</div>
                  </div>
                  <button type="button" className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Удалить задачу"
                    onClick={async () => { await deleteTask(t.id).catch(() => {}); setTasks(await getTasks({ leadId: lead.id })); }}><Trash2 size={14} /></button>
                </div>
              ))}
              {taskForm && (
                <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                  <div className="flex flex-wrap gap-1">
                    {TASK_KINDS.map(k => (
                      <button key={k.id} type="button" onClick={() => setTaskForm({ ...taskForm, kind: k.id })}
                        className={`h-8 px-3 rounded-full text-xs border ${taskForm.kind === k.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{k.label}</button>
                    ))}
                  </div>
                  <Input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder={`${taskKindLabel(taskForm.kind)}: что сделать`} className="h-10" />
                  <div className="flex flex-wrap gap-2 items-center">
                    <input type="datetime-local" value={taskForm.due} onChange={e => setTaskForm({ ...taskForm, due: e.target.value })} className={`${field} sm:w-auto flex-1`} />
                    <div className="flex gap-2 ml-auto">
                      <Button size="sm" variant="ghost" onClick={() => setTaskForm(null)}>Отмена</Button>
                      <Button size="sm" onClick={saveTask}>Сохранить</Button>
                    </div>
                  </div>
                </div>
              )}
              {doneTasks.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Выполненные ({doneTasks.length})</summary>
                  <ul className="mt-1 space-y-1">{doneTasks.map(t => <li key={t.id} className="line-through">{t.title} · {time(t.done_at!)}{t.result ? ` — ${t.result}` : ''}</li>)}</ul>
                </details>
              )}
            </section>

            {/* Данные клиента */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Клиент</h3>
                {!edit && <Button size="sm" variant="ghost" className="h-8" onClick={() => setEdit({ client_name: lead.client_name, client_phone: lead.client_phone, address: lead.address, source: lead.source, amount: lead.amount, comment: lead.comment, manager_id: lead.manager_id })}><Pencil size={13} className="mr-1" />Изменить</Button>}
              </div>
              {edit ? (
                <div className="grid gap-2">
                  <Input value={edit.client_name ?? ''} onChange={e => setEdit({ ...edit, client_name: e.target.value })} placeholder="Имя" className="h-10" />
                  <Input value={edit.client_phone ?? ''} onChange={e => setEdit({ ...edit, client_phone: e.target.value })} placeholder="Телефон" inputMode="tel" className="h-10" />
                  <Input value={edit.address ?? ''} onChange={e => setEdit({ ...edit, address: e.target.value })} placeholder="Адрес / ЖК" className="h-10" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={edit.source ?? ''} onChange={e => setEdit({ ...edit, source: e.target.value || null })} className={field}>
                      <option value="">Источник</option>{SOURCES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <Input value={edit.amount ? String(edit.amount) : ''} onChange={e => setEdit({ ...edit, amount: Number(e.target.value.replace(/\D/g, '')) || 0 })} placeholder="Бюджет, ₸" inputMode="numeric" className="h-10" />
                  </div>
                  {canViewAllManagers && (
                    <select value={edit.manager_id ?? ''} onChange={e => setEdit({ ...edit, manager_id: e.target.value || null })} className={field}>
                      <option value="">Ответственный</option>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                  <Textarea value={edit.comment ?? ''} onChange={e => setEdit({ ...edit, comment: e.target.value })} placeholder="Что хочет клиент: двери, количество, сроки…" rows={3} />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Отмена</Button>
                    <Button size="sm" onClick={saveEdit} disabled={busy}>Сохранить</Button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Телефон</dt><dd>{showPhone(lead.client_phone) || '—'}</dd>
                  <dt className="text-muted-foreground">Адрес</dt><dd>{lead.address || '—'}</dd>
                  <dt className="text-muted-foreground">Источник</dt><dd>{lead.source || '—'}</dd>
                  <dt className="text-muted-foreground">Бюджет</dt><dd>{lead.amount ? formatCurrency(lead.amount) : '—'}</dd>
                  <dt className="text-muted-foreground">Ответственный</dt><dd className="flex items-center gap-1"><UserRound size={13} className="text-muted-foreground" />{managerName(lead.manager_id)}</dd>
                  <dt className="text-muted-foreground">На этапе</dt><dd>{daysOnStage(lead)} дн.</dd>
                  {lead.comment && <><dt className="text-muted-foreground">Комментарий</dt><dd className="whitespace-pre-wrap">{lead.comment}</dd></>}
                </dl>
              )}
            </section>

            {/* История */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">История</h3>
              <div className="flex gap-2">
                <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий: о чём договорились…" rows={2} className="min-h-0" />
                <Button className="self-end" onClick={sendNote} disabled={!note.trim()}>Добавить</Button>
              </div>
              <ol className="relative border-l ml-2 space-y-3 pt-1">
                {events.map(ev => {
                  const I = EVENT_ICON[ev.kind] ?? StickyNote;
                  return (
                    <li key={ev.id} className="ml-4">
                      <span className="absolute -left-[9px] mt-0.5 h-[18px] w-[18px] rounded-full bg-background border flex items-center justify-center"><I size={10} className="text-muted-foreground" /></span>
                      <div className={`text-sm whitespace-pre-wrap break-words ${ev.kind === 'note' ? 'rounded-md bg-muted/50 px-2.5 py-1.5' : ''}`}>{ev.text}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{[time(ev.created_at), ev.author_name].filter(Boolean).join(' · ')}</div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </>)}

        {/* Выполнение задачи */}
        <Dialog open={!!doneTask} onOpenChange={v => { if (!v) setDoneTask(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Задача выполнена</DialogTitle><DialogDescription>{doneTask?.task.title}</DialogDescription></DialogHeader>
            {doneTask && (
              <div className="space-y-3">
                <Textarea value={doneTask.result} onChange={e => setDoneTask({ ...doneTask, result: e.target.value })} placeholder="Результат: что сказал клиент" rows={3} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={doneTask.next} onChange={e => setDoneTask({ ...doneTask, next: e.target.checked })} />Сразу поставить следующую задачу</label>
                <Button className="w-full h-11" onClick={finishTask}><Check size={16} className="mr-1.5" />Готово</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Успешно */}
        <Dialog open={!!win} onOpenChange={v => { if (!v) setWin(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Успешная продажа</DialogTitle><DialogDescription>Сделка уйдёт в «Подтверждения» — как из amoCRM.</DialogDescription></DialogHeader>
            {win && (
              <div className="space-y-3">
                <label className="block space-y-1"><span className="text-sm font-medium">Сумма сделки, ₸</span>
                  <Input value={win.amount} onChange={e => setWin({ ...win, amount: e.target.value.replace(/[^\d\s]/g, '') })} inputMode="numeric" className="h-11" /></label>
                <label className="block space-y-1"><span className="text-sm font-medium">Предоплата, ₸</span>
                  <Input value={win.paid} onChange={e => setWin({ ...win, paid: e.target.value.replace(/[^\d\s]/g, '') })} inputMode="numeric" className="h-11" placeholder="0" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1"><span className="text-sm font-medium">№ договора</span><Input value={win.contract} onChange={e => setWin({ ...win, contract: e.target.value })} className="h-11" /></label>
                  <label className="block space-y-1"><span className="text-sm font-medium">Что продали</span><Input value={win.door} onChange={e => setWin({ ...win, door: e.target.value })} className="h-11" placeholder="Двери PD" /></label>
                </div>
                <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" onClick={confirmWin} disabled={busy}><Trophy size={16} className="mr-1.5" />Отправить в «Подтверждения»</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Отказ */}
        <Dialog open={!!lost} onOpenChange={v => { if (!v) setLost(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Причина отказа</DialogTitle><DialogDescription>По причинам строится отчёт — почему теряем клиентов.</DialogDescription></DialogHeader>
            {lost && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {lostReasons.map(r => (
                    <button key={r} type="button" onClick={() => setLost({ ...lost, reason: r })}
                      className={`h-9 px-3 rounded-full text-sm border ${lost.reason === r ? 'bg-destructive text-white border-destructive' : 'hover:bg-muted'}`}>{r}</button>
                  ))}
                </div>
                <Textarea value={lost.comment} onChange={e => setLost({ ...lost, comment: e.target.value })} placeholder="Подробнее (необязательно)" rows={2} />
                <Button variant="destructive" className="w-full h-11" onClick={confirmLost} disabled={busy}>Закрыть лид</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
