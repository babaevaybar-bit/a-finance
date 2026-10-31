import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Phone, MessageCircle, Trophy, XCircle, Check, Plus, Trash2, CalendarClock, StickyNote, ArrowRight,
  UserRound, Sparkles, Pencil, ExternalLink, AlertTriangle, ChevronDown, Clock3, UserCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { Manager } from '@/types/types';
import {
  type CrmLead, type CrmStage, type CrmTask, type CrmEvent, type TaskKind,
  getLead, updateLead, handoffLead, getEvents, addNote, addEvent, getTasks, createTask, completeTask, deleteTask, rescheduleTask, winLead,
  TASK_KINDS, taskKindLabel, SOURCES, dueLabel, isOverdue, normPhone, showPhone, daysOnStage, DUE_PRESETS,
} from '@/lib/crm';
const toKzLocal = (iso: string) => { const d = new Date(iso); return `${d.toLocaleDateString('en-CA', { timeZone: 'Asia/Qyzylorda' })}T${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qyzylorda' })}`; };
import { formatCurrency } from '@/lib/utils';
import LeadChat from './LeadChat';

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
  won: Trophy, lost: XCircle, edit: Pencil, handoff: UserCheck,
};

export default function LeadSheet({ leadId, initialTab = 'card', stages, lostReasons, managers, onClose, onChanged }: {
  leadId: string | null;
  initialTab?: 'card' | 'chat';
  stages: CrmStage[];
  lostReasons: string[];
  managers: Manager[];
  onClose: () => void;
  onChanged: (l: CrmLead) => void;
}) {
  const { profile, editsAll } = useAuth();
  const canEditAllLeads = editsAll('crm');
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
  const [tab, setTab] = useState<'card' | 'chat' | 'history'>('card');
  // Передача лида менеджеру
  const [handoff, setHandoff] = useState<{ to: string; comment: string; advance: boolean; kind: TaskKind; title: string; due: string } | null>(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    try {
      const [l, ev, ts] = await Promise.all([getLead(leadId), getEvents(leadId), getTasks({ leadId })]);
      setLead(l); setEvents(ev); setTasks(ts);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось загрузить'); }
  }, [leadId]);
  useEffect(() => { setLead(null); setEdit(null); setNote(''); setTaskForm(null); setTab(initialTab); if (leadId) load(); }, [leadId, load]); // eslint-disable-line react-hooks/exhaustive-deps
  // есть непрочитанные — сразу открываем переписку и снимаем отметку в списке
  const firstUnread = lead?.id && lead.unread ? lead.id : null;
  useEffect(() => {
    if (!firstUnread || !lead) return;
    setTab('chat');
    const n = { ...lead, unread: 0 }; setLead(n); onChanged(n);
  }, [firstUnread]); // eslint-disable-line react-hooks/exhaustive-deps

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
    patch({ stage_id: s.id }).then(() => { if (!openTasks.length) setTaskForm({ kind: 'call', title: '', due: defaultDue() }); });
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

  async function confirmHandoff() {
    if (!lead || !handoff?.to) return;
    const open = pipeStages.filter(s => s.kind === 'open');
    const i = open.findIndex(s => s.id === lead.stage_id);
    const advanceTo = handoff.advance && i === 0 && open[1] ? open[1].id : null;
    setBusy(true);
    try {
      await handoffLead(lead.id, handoff.to, handoff.comment.trim() || null, advanceTo,
        handoff.due ? { kind: handoff.kind, title: handoff.title.trim() || null, due_at: kzLocalToIso(handoff.due) } : null);
      const toName = managerName(handoff.to);
      setHandoff(null);
      toast.success(`Лид передан: ${toName}`);
      const l = await getLead(lead.id).catch(() => null);
      if (l) { setLead(l); onChanged(l); const [ts, ev] = await Promise.all([getTasks({ leadId: lead.id }), getEvents(lead.id)]); setTasks(ts); setEvents(ev); }
      else { onChanged({ ...lead, manager_id: handoff.to }); onClose(); }   // после передачи лид больше не виден — закрываем
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось передать'); }
    finally { setBusy(false); }
  }

  const phoneDigits = lead?.client_phone?.replace(/\D/g, '') ?? '';
  // Лид другого менеджера при доступе «все — только просмотр»: этап и данные не меняем
  const ro = !!lead && !canEditAllLeads && lead.manager_id !== (profile?.manager_id ?? null);

  return (
    <Sheet open={!!leadId} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden">
        {!lead ? (
          <div className="p-6 space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : (<>
          {/* Шапка: кто клиент, этап, действия */}
          <div className="px-5 pt-4 pb-4 border-b space-y-3 shrink-0">
            <div className="pr-8 flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: stage?.color ?? '#94a3b8' }}>
                {lead.client_name.replace(/[^\p{L}\d]/gu, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg leading-tight truncate">{lead.client_name}</SheetTitle>
                <SheetDescription className="mt-0.5 truncate">
                  {[showPhone(lead.client_phone) || 'нет телефона', lead.source, lead.amount ? formatCurrency(lead.amount) : null].filter(Boolean).join(' · ')}
                </SheetDescription>
              </div>
            </div>

            {(() => {
              const open = pipeStages.filter(s => s.kind === 'open');
              const i = open.findIndex(s => s.id === lead.stage_id);
              const nx = !closed && i >= 0 && i < open.length - 1 ? open[i + 1] : null;
              return (<>
                {/* Этап: выпадающий список + «Дальше» */}
                <div className="flex items-stretch gap-2">
                  <label className="relative flex-1 min-w-0">
                    <span className="sr-only">Этап</span>
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full pointer-events-none" style={{ background: stage?.color }} />
                    <select value={lead.stage_id} disabled={busy || ro} onChange={e => { const st = pipeStages.find(x => x.id === e.target.value); if (st) moveTo(st); }}
                      className="h-11 w-full appearance-none rounded-lg border border-input bg-background pl-8 pr-9 text-sm font-medium truncate disabled:opacity-100">
                      {pipeStages.map((s, k) => <option key={s.id} value={s.id}>{s.kind === 'open' ? `${k + 1}. ${s.name}` : s.name}</option>)}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </label>
                  {nx && !ro && (
                    <Button className="h-11 shrink-0" disabled={busy} onClick={() => moveTo(nx)} title={`Перенести на «${nx.name}»`}>
                      Дальше<ArrowRight size={15} className="ml-1.5" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground -mt-1">
                  <div className="flex-1 flex gap-0.5">
                    {open.map((s, k) => <span key={s.id} className="h-1 flex-1 rounded-full" style={{ background: closed ? (stage?.kind === 'won' ? '#16a34a' : 'hsl(var(--muted))') : k <= i ? (stage?.color ?? '#94a3b8') : 'hsl(var(--muted))' }} />)}
                  </div>
                  <span className="shrink-0">{daysOnStage(lead)} дн. на этапе</span>
                </div>
                {closed && (
                  <div className={`rounded-lg px-3 py-2 text-sm ${stage?.kind === 'won' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                    {stage?.kind === 'won' ? 'Успешно — сделка в «Подтверждениях»' : `Отказ${lead.lost_reason ? `: ${lead.lost_reason}` : ''}`}
                    {!ro && <span className="block text-xs opacity-80">Чтобы вернуть в работу — выберите этап в списке выше.</span>}
                  </div>
                )}

                {/* Действия: 4 одинаковые кнопки */}
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { key: 'call', label: 'Позвонить', icon: Phone, cls: 'text-foreground', href: phoneDigits ? `tel:+${phoneDigits.length === 10 ? '7' + phoneDigits : phoneDigits}` : null, on: undefined, off: !phoneDigits },
                    { key: 'wa', label: 'Написать', icon: MessageCircle, cls: 'text-emerald-600', href: null, on: () => setTab('chat'), off: false },
                    { key: 'won', label: 'Успешно', icon: Trophy, cls: 'text-emerald-700', href: null, on: () => setWin({ amount: lead.amount ? String(lead.amount) : '', paid: '', contract: '', door: '' }), off: closed || ro },
                    { key: 'lost', label: 'Отказ', icon: XCircle, cls: 'text-red-600', href: null, on: () => setLost({ reason: '', comment: '' }), off: closed || ro },
                  ]).map(a => {
                    const I = a.icon;
                    const inner = (<>
                      <I size={18} className={a.off ? 'text-muted-foreground/50' : a.cls} />
                      <span className="text-[11px] font-medium">{a.label}</span>
                      {a.key === 'wa' && !!lead.unread && <span className="absolute top-1 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center">{lead.unread}</span>}
                    </>);
                    const cls = `relative h-14 rounded-lg border bg-background flex flex-col items-center justify-center gap-1 transition-colors ${a.off ? 'opacity-50 pointer-events-none' : 'hover:bg-muted'}`;
                    return a.href
                      ? <a key={a.key} href={a.href} className={cls}>{inner}</a>
                      : <button key={a.key} type="button" onClick={a.on} disabled={a.off} className={cls}>{inner}</button>;
                  })}
                </div>
              </>);
            })()}
            {/* Ответственный и передача другому менеджеру */}
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 pl-3 pr-1.5 py-1.5">
              <UserRound size={15} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <span className="text-muted-foreground">Ответственный: </span><span className="font-medium">{managerName(lead.manager_id)}</span>
              </div>
              {!ro && !closed && (
                <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={busy}
                  onClick={() => setHandoff({ to: '', comment: '', advance: pipeStages.filter(s => s.kind === 'open')[0]?.id === lead.stage_id, kind: 'call', title: '', due: toKzLocal(DUE_PRESETS[0].at()) })}>
                  <UserCheck size={14} className="mr-1.5" />Передать
                </Button>
              )}
            </div>
            {ro && <p className="text-xs text-muted-foreground">Лид другого менеджера — только просмотр. Задачи и заметки добавлять можно.</p>}
            {lead.deal_id && <a href="/approvals" className="text-xs text-primary inline-flex items-center gap-1 hover:underline"><ExternalLink size={12} />Открыть сделку в «Подтверждениях»</a>}
          </div>

          {/* Вкладки */}
          <div className="flex border-b shrink-0 px-5 gap-5 text-sm">
            {([['card', 'Главное', openTasks.length], ['chat', 'WhatsApp', lead.unread ?? 0], ['history', 'История', events.length]] as const).map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`relative h-10 font-medium transition-colors ${tab === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {l}
                {!!n && tab !== k && <span className={`ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[11px] ${k === 'chat' ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}>{n}</span>}
                {tab === k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
              </button>
            ))}
          </div>
          {tab === 'history' ? null : tab === 'chat' ? (
            <div className="flex-1 min-h-0">
              <LeadChat leadId={lead.id} hasPhone={phoneDigits.length >= 10}
                onSent={t => { const n = { ...lead, unread: 0, last_message_text: t, last_message_at: new Date().toISOString() }; setLead(n); onChanged(n); }} />
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
            {/* Следующий шаг */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Следующий шаг</h3>
              {openTasks.slice(0, 1).map(t => {
                const late = isOverdue(t);
                return (
                  <div key={t.id} className={`rounded-xl border p-3 space-y-2.5 ${late ? 'border-red-200 bg-red-50/70' : 'bg-background'}`}>
                    <div className="flex items-start gap-2">
                      <CalendarClock size={18} className={`mt-0.5 shrink-0 ${late ? 'text-red-600' : 'text-primary'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-snug">{t.title}</div>
                        <div className={`text-sm ${late ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{late ? 'Просрочено · ' : ''}{dueLabel(t.due_at)}</div>
                      </div>
                      <button type="button" className="h-8 w-8 rounded-md hover:bg-background flex items-center justify-center text-muted-foreground shrink-0" title="Удалить задачу" aria-label="Удалить задачу"
                        onClick={async () => { await deleteTask(t.id).catch(() => {}); setTasks(await getTasks({ leadId: lead.id })); }}><Trash2 size={14} /></button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDoneTask({ task: t, result: '', next: true })}><Check size={15} className="mr-1.5" />Сделано</Button>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 size={13} />Перенести:</div>
                      {DUE_PRESETS.slice(0, 3).map(p => (
                        <button key={p.label} type="button" className="h-9 px-2.5 rounded-md border bg-background text-xs hover:bg-muted"
                          onClick={async () => { await rescheduleTask(t.id, p.at()).catch(e => toast.error(e.message)); setTasks(await getTasks({ leadId: lead.id })); toast.success(`Перенесено: ${p.label.toLowerCase()}`); }}>{p.label}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!openTasks.length && !taskForm && !closed && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm text-amber-900 flex items-center gap-1.5"><AlertTriangle size={14} />Шаг не назначен — клиент может потеряться</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([['call', 'Позвонить', 1], ['message', 'Написать', 0], ['meeting', 'Встреча', 1], ['measure', 'Замер', 1]] as const).map(([k, l, d]) => (
                      <button key={k} type="button" className="h-9 px-3 rounded-md border border-amber-300 bg-background text-sm hover:bg-amber-100"
                        onClick={() => setTaskForm({ kind: k, title: '', due: toKzLocal(DUE_PRESETS[d === 1 ? 2 : 0].at()) })}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {taskForm && (
                <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
                  <div className="flex flex-wrap gap-1">
                    {TASK_KINDS.map(k => (
                      <button key={k.id} type="button" onClick={() => setTaskForm({ ...taskForm, kind: k.id })}
                        className={`h-8 px-3 rounded-full text-xs border ${taskForm.kind === k.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{k.label}</button>
                    ))}
                  </div>
                  <Input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder={`${taskKindLabel(taskForm.kind)}: что сделать (необязательно)`} className="h-10" />
                  <div className="flex flex-wrap gap-1">
                    {DUE_PRESETS.map(p => {
                      const v = toKzLocal(p.at());
                      return <button key={p.label} type="button" onClick={() => setTaskForm({ ...taskForm, due: v })}
                        className={`h-8 px-3 rounded-full text-xs border ${taskForm.due === v ? 'bg-primary/10 border-primary text-primary' : 'bg-background hover:bg-muted'}`}>{p.label}</button>;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input type="datetime-local" value={taskForm.due} onChange={e => setTaskForm({ ...taskForm, due: e.target.value })} className={`${field} sm:w-auto flex-1`} />
                    <div className="flex gap-2 ml-auto">
                      <Button size="sm" variant="ghost" onClick={() => setTaskForm(null)}>Отмена</Button>
                      <Button size="sm" onClick={saveTask}>Сохранить</Button>
                    </div>
                  </div>
                </div>
              )}
              {openTasks.length > 1 && (
                <ul className="space-y-1">
                  {openTasks.slice(1).map(t => (
                    <li key={t.id} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2">
                      <button type="button" onClick={() => setDoneTask({ task: t, result: '', next: false })} aria-label="Выполнено"
                        className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-600 shrink-0" />
                      <span className="flex-1 truncate">{t.title}</span>
                      <span className={`text-xs shrink-0 ${isOverdue(t) ? 'text-red-600' : 'text-muted-foreground'}`}>{dueLabel(t.due_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between">
                {!taskForm && (openTasks.length > 0 || closed) && <button type="button" className="text-sm text-primary inline-flex items-center gap-1 hover:underline" onClick={() => setTaskForm({ kind: 'call', title: '', due: defaultDue() })}><Plus size={14} />Ещё задача</button>}
                {doneTasks.length > 0 && (
                  <details className="text-xs text-muted-foreground ml-auto">
                    <summary className="cursor-pointer">Выполнено ({doneTasks.length})</summary>
                    <ul className="mt-1 space-y-1">{doneTasks.map(t => <li key={t.id} className="line-through">{t.title} · {time(t.done_at!)}{t.result ? ` — ${t.result}` : ''}</li>)}</ul>
                  </details>
                )}
              </div>
            </section>

            {/* Данные клиента */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Клиент</h3>
                {!edit && !ro && <Button size="sm" variant="ghost" className="h-8" onClick={() => setEdit({ client_name: lead.client_name, client_phone: lead.client_phone, address: lead.address, source: lead.source, amount: lead.amount, comment: lead.comment, manager_id: lead.manager_id })}><Pencil size={13} className="mr-1" />Изменить</Button>}
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
                  {canEditAllLeads && (
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
                <div className="rounded-xl border divide-y text-sm bg-background">
                  {([
                    ['Телефон', showPhone(lead.client_phone)],
                    ['Адрес / ЖК', lead.address],
                    ['Бюджет', lead.amount ? formatCurrency(lead.amount) : null],
                    ['Источник', lead.source],
                    ['Ответственный', managerName(lead.manager_id)],
                    ['Что хочет', lead.comment],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex gap-3 px-3 py-2">
                      <span className="w-28 shrink-0 text-muted-foreground">{k}</span>
                      {v ? <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{v}</span>
                        : !ro ? <button type="button" className="text-primary/80 hover:text-primary text-left" onClick={() => setEdit({ client_name: lead.client_name, client_phone: lead.client_phone, address: lead.address, source: lead.source, amount: lead.amount, comment: lead.comment, manager_id: lead.manager_id })}>+ добавить</button>
                        : <span className="text-muted-foreground">—</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
          )}
          {tab === 'history' && (
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {/* История */}
            <section className="space-y-2">
              <p className="text-xs text-muted-foreground">Всё, что происходило с лидом. Запишите, о чём договорились с клиентом — коллеги увидят.</p>
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
          )}
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
        <Dialog open={!!handoff} onOpenChange={v => { if (!v) setHandoff(null); }}>
        <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Передать лида</DialogTitle>
            <DialogDescription>{lead?.client_name} — сейчас у {managerName(lead?.manager_id ?? null)}. Выберите менеджера и поставьте ему задачу.</DialogDescription>
          </DialogHeader>
          {handoff && (
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); confirmHandoff(); }}>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Кому</span>
                <div className="grid grid-cols-2 gap-2">
                  {[...managers].filter(m => m.id !== lead?.manager_id && m.is_active !== false)
                    .sort((a, b) => Number(b.role === 'Менеджер по продажам') - Number(a.role === 'Менеджер по продажам') || a.name.localeCompare(b.name))
                    .map(m => (
                      <button key={m.id} type="button" onClick={() => setHandoff(h => h && { ...h, to: m.id })}
                        className={`h-12 rounded-lg border px-3 text-left transition-colors ${handoff.to === m.id ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted'}`}>
                        <div className="text-sm font-medium truncate">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{m.role}</div>
                      </button>
                    ))}
                </div>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <span className="text-sm font-medium">Задача менеджеру</span>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_KINDS.map(k => (
                    <button key={k.id} type="button" onClick={() => setHandoff(h => h && { ...h, kind: k.id })}
                      className={`h-8 px-3 rounded-full text-xs border ${handoff.kind === k.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{k.label}</button>
                  ))}
                </div>
                <Input value={handoff.title} onChange={e => setHandoff(h => h && { ...h, title: e.target.value })} className="h-9"
                  placeholder={`${taskKindLabel(handoff.kind)}: что сделать (необязательно)`} />
                <div className="flex flex-wrap gap-1.5">
                  {DUE_PRESETS.map(pr => {
                    const v = toKzLocal(pr.at());
                    return (
                      <button key={pr.label} type="button" onClick={() => setHandoff(h => h && { ...h, due: v })}
                        className={`h-8 px-2.5 rounded-full text-xs border ${handoff.due === v ? 'bg-primary/10 border-primary text-primary' : 'bg-background hover:bg-muted'}`}>{pr.label}</button>
                    );
                  })}
                </div>
                <Input type="datetime-local" value={handoff.due} onChange={e => setHandoff(h => h && { ...h, due: e.target.value })} className="h-9" />
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Что важно знать <span className="text-muted-foreground font-normal">— необязательно</span></span>
                <Textarea value={handoff.comment} onChange={e => setHandoff(h => h && { ...h, comment: e.target.value })} rows={2}
                  placeholder="Например: хочет 5 скрытых дверей, перезвонить после 18:00" />
              </label>
              {(() => {
                const open = pipeStages.filter(s => s.kind === 'open');
                return open[0]?.id === lead?.stage_id && open[1] ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={handoff.advance} onChange={e => setHandoff(h => h && { ...h, advance: e.target.checked })} />
                    Перевести на этап «{open[1].name}»
                  </label>
                ) : null;
              })()}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setHandoff(null)}>Отмена</Button>
                <Button type="submit" disabled={busy || !handoff.to || !handoff.due}>{busy ? 'Передаю…' : handoff.to ? `Передать: ${managerName(handoff.to)}` : 'Выберите менеджера'}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
