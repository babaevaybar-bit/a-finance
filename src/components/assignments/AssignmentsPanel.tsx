import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Plus, Check, X, Send, ArrowRight, CalendarClock, Trash2, ChevronRight, RotateCcw, ClipboardCheck, UserRound, Phone, MapPin, Cake,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { UserAvatar } from '@/components/common/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { getManagers, notifyCountersChanged } from '@/lib/api';
import type { Manager, Profile } from '@/types/types';
import {
  type Assignment, type AssignmentTarget, type AssignmentMessage, STATUS, LINKS, TEMPLATES,
  loadAssignments, createAssignment, deleteAssignment, getThread, act,
} from '@/lib/assignments';

const KZ = 'Asia/Qyzylorda';
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: KZ });
const dueText = (iso: string) => {
  const late = new Date(iso).getTime() < Date.now();
  return { text: `до ${new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: KZ })}`, late };
};
const linkLabel = (l: string | null) => LINKS.find(x => x.value === l)?.label ?? l;
const kzDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: KZ });

/**
 * Поручения: руководитель ставит задачу сотрудникам → сотрудник «Готово» →
 * руководитель «Подтвердить» (закрыто) или «Вернуть» с причиной → сотрудник исправляет и снова «Готово».
 * По каждому сотруднику — своя переписка.
 */
export default function AssignmentsPanel() {
  const { profile } = useAuth();
  const isBoss = ['director', 'director_view', 'rop', 'technolog'].includes(profile?.role ?? '');
  const myId = profile?.manager_id ?? null;
  const me = profile?.name && profile.name !== 'admin' ? profile.name : (profile?.email ?? null);

  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [targets, setTargets] = useState<AssignmentTarget[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const [view, setView] = useState<'mine' | 'given'>(isBoss ? 'given' : 'mine');

  const load = useCallback(async () => {
    try {
      const r = await loadAssignments();
      setAssignments(r.assignments); setTargets(r.targets);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось загрузить поручения'); setAssignments([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getManagers().then(m => setManagers(m.filter(x => x.is_active !== false))).catch(() => {});
    supabase.from('profiles').select('*').then(({ data }) => setProfiles((data as Profile[]) ?? []));
  }, []);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel('assignments-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_targets' }, () => { if (t) clearTimeout(t); t = setTimeout(() => { load(); notifyCountersChanged(); }, 400); })
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [load]);

  const mName = (id: string) => managers.find(m => m.id === id)?.name ?? profiles.find(p => p.manager_id === id)?.name ?? '—';
  const profileOf = (managerId: string) => profiles.find(p => p.manager_id === managerId);
  const byAssignment = useMemo(() => {
    const m = new Map<string, AssignmentTarget[]>();
    for (const t of targets) m.set(t.assignment_id, [...(m.get(t.assignment_id) ?? []), t]);
    return m;
  }, [targets]);
  const aById = useMemo(() => new Map((assignments ?? []).map(a => [a.id, a])), [assignments]);

  const mine = targets.filter(t => t.manager_id === myId)
    .sort((a, b) => order(a.status) - order(b.status) || b.updated_at.localeCompare(a.updated_at));
  const given = (assignments ?? []).filter(a => (byAssignment.get(a.id) ?? []).some(t => t.manager_id !== myId) || a.created_by === profile?.id);
  const mineWaiting = mine.filter(t => t.status === 'open' || t.status === 'rejected').length;
  const givenWaiting = given.reduce((n, a) => n + (byAssignment.get(a.id) ?? []).filter(t => t.status === 'submitted').length, 0);

  const target = targets.find(t => t.id === openTarget) ?? null;
  const assignment = openAssignment ? aById.get(openAssignment) ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {isBoss && (
          <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
            {([['given', 'Я поручил', givenWaiting], ['mine', 'Мне поручили', mineWaiting]] as const).map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => setView(k)}
                className={`h-8 px-3 rounded-md text-sm inline-flex items-center gap-1.5 ${view === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>
                {l}{n > 0 && <span className="text-[10px] min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white flex items-center justify-center">{n}</span>}
              </button>
            ))}
          </div>
        )}
        {isBoss && <Button size="sm" className="ml-auto h-9" onClick={() => setCreating(true)}><Plus size={15} className="mr-1.5" />Новое поручение</Button>}
      </div>

      {assignments === null ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : view === 'mine' ? (
        mine.length === 0 ? <Empty text="Вам пока ничего не поручили" /> : (
          <div className="space-y-2">
            {mine.map(t => {
              const a = aById.get(t.assignment_id);
              if (!a) return null;
              const d = a.due_at ? dueText(a.due_at) : null;
              return (
                <button key={t.id} type="button" onClick={() => setOpenTarget(t.id)}
                  className={`w-full text-left rounded-xl border bg-card px-4 py-3 hover:border-primary/40 transition-colors ${t.status === 'open' || t.status === 'rejected' ? 'border-primary/40' : ''}`}>
                  <div className="flex items-start gap-3">
                    <ClipboardCheck size={18} className="mt-0.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {[a.created_by_name ? `от ${a.created_by_name}` : null, when(a.created_at)].filter(Boolean).join(' · ')}
                        {d && <span className={d.late && t.status !== 'approved' ? ' text-red-600' : ''}> · {d.text}</span>}
                      </div>
                    </div>
                    <StatusChip s={t.status} />
                  </div>
                  {t.status === 'rejected' && <p className="mt-2 text-xs text-red-700 pl-[30px]">Вернули на доработку — откройте, там причина</p>}
                </button>
              );
            })}
          </div>
        )
      ) : (
        given.length === 0 ? <Empty text="Поручений пока нет. Нажмите «Новое поручение» — например, заполнить профиль и поставить фото." /> : (
          <div className="space-y-2">
            {given.map(a => {
              const ts = (byAssignment.get(a.id) ?? []).filter(t => t.manager_id !== myId || a.created_by !== profile?.id);
              const c = { approved: 0, submitted: 0, rejected: 0, open: 0 } as Record<string, number>;
              ts.forEach(t => { c[t.status] += 1; });
              const d = a.due_at ? dueText(a.due_at) : null;
              const done = ts.length > 0 && c.approved === ts.length;
              return (
                <button key={a.id} type="button" onClick={() => setOpenAssignment(a.id)}
                  className={`w-full text-left rounded-xl border bg-card px-4 py-3 hover:border-primary/40 transition-colors ${c.submitted ? 'border-amber-300' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium flex items-center gap-2">{a.title}{done && <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">закрыто</span>}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {when(a.created_at)}{a.link ? ` · ${linkLabel(a.link)}` : ''}
                        {d && <span className={d.late && !done ? ' text-red-600' : ''}> · {d.text}</span>}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground mt-1 shrink-0" />
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden flex">
                    <div className="bg-emerald-500" style={{ width: `${ts.length ? (c.approved / ts.length) * 100 : 0}%` }} />
                    <div className="bg-amber-400" style={{ width: `${ts.length ? (c.submitted / ts.length) * 100 : 0}%` }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>подтверждено <b className="text-foreground">{c.approved}</b> из {ts.length}</span>
                    {c.submitted > 0 && <span className="text-amber-700 font-medium">ждут проверки {c.submitted}</span>}
                    {c.rejected > 0 && <span className="text-red-600">вернули {c.rejected}</span>}
                    {c.open > 0 && <span>не сделали {c.open}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* Поручение: список сотрудников со статусами */}
      <Sheet open={!!assignment} onOpenChange={v => { if (!v) setOpenAssignment(null); }}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col gap-0">
          {assignment && (() => {
            const ts = [...(byAssignment.get(assignment.id) ?? [])].sort((a, b) => order2(a.status) - order2(b.status) || mName(a.manager_id).localeCompare(mName(b.manager_id)));
            return (<>
              <div className="px-5 pt-5 pb-4 border-b space-y-1">
                <SheetTitle className="pr-8">{assignment.title}</SheetTitle>
                <SheetDescription className="whitespace-pre-wrap">{assignment.description || 'Без описания'}</SheetDescription>
                <div className="text-xs text-muted-foreground pt-1">
                  {when(assignment.created_at)}{assignment.link ? ` · ведёт в «${linkLabel(assignment.link)}»` : ''}{assignment.due_at ? ` · ${dueText(assignment.due_at).text}` : ''}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto divide-y">
                {ts.map(t => {
                  const p = profileOf(t.manager_id);
                  return (
                    <button key={t.id} type="button" onClick={() => setOpenTarget(t.id)} className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-muted/30">
                      <UserAvatar name={mName(t.manager_id)} url={p?.avatar_url} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{mName(t.manager_id)}</div>
                        <div className="text-[11px] text-muted-foreground">{t.submitted_at && t.status === 'submitted' ? `отправил ${when(t.submitted_at)}` : t.reviewed_at ? `проверено ${when(t.reviewed_at)}` : 'ещё не отправлял'}</div>
                      </div>
                      <StatusChip s={t.status} />
                      <ChevronRight size={15} className="text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
              {(assignment.created_by === profile?.id || profile?.role === 'director') && (
                <div className="border-t p-3 flex justify-end">
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                    if (!confirm(`Удалить поручение «${assignment.title}» вместе с перепиской?`)) return;
                    try { await deleteAssignment(assignment.id); setOpenAssignment(null); load(); notifyCountersChanged(); toast.success('Удалено'); }
                    catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось удалить'); }
                  }}><Trash2 size={14} className="mr-1.5" />Удалить поручение</Button>
                </div>
              )}
            </>);
          })()}
        </SheetContent>
      </Sheet>

      {target && aById.get(target.assignment_id) && (
        <TargetThread target={target} assignment={aById.get(target.assignment_id)!} employeeName={mName(target.manager_id)}
          employee={profileOf(target.manager_id)} isMine={target.manager_id === myId} isReviewer={isBoss} me={me}
          onClose={() => setOpenTarget(null)} onChanged={() => { load(); notifyCountersChanged(); }} />
      )}

      <NewAssignmentDialog open={creating} onOpenChange={setCreating} managers={managers} profiles={profiles} me={me}
        onCreated={() => { setCreating(false); setView('given'); load(); }} />
    </div>
  );
}

const order = (s: string) => ({ rejected: 0, open: 1, submitted: 2, approved: 3 } as Record<string, number>)[s] ?? 9;
const order2 = (s: string) => ({ submitted: 0, rejected: 1, open: 2, approved: 3 } as Record<string, number>)[s] ?? 9;

function StatusChip({ s }: { s: AssignmentTarget['status'] }) {
  return <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${STATUS[s].cls}`}>{STATUS[s].label}</span>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed bg-card py-10 px-6 text-center text-sm text-muted-foreground"><ClipboardCheck className="mx-auto mb-2 text-muted-foreground/60" size={22} />{text}</div>;
}

/** Переписка по поручению с одним сотрудником + кнопки «Готово» / «Подтвердить» / «Вернуть» */
function TargetThread({ target, assignment, employeeName, employee, isMine, isReviewer, me, onClose, onChanged }: {
  target: AssignmentTarget; assignment: Assignment; employeeName: string; employee?: Profile; isMine: boolean; isReviewer: boolean;
  me: string | null; onClose: () => void; onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<AssignmentMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => getThread(target.id).then(setMsgs).catch(() => setMsgs([])), [target.id]);
  useEffect(() => { setMsgs(null); setText(''); setRejecting(false); reload(); }, [reload]);
  useEffect(() => {
    const ch = supabase.channel(`asg-${target.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'assignment_messages', filter: `target_id=eq.${target.id}` }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [target.id, reload]);
  useLayoutEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);

  async function run(action: AssignmentMessage['kind'], body?: string) {
    setBusy(true);
    try {
      await act(target.id, action, body ?? null);
      setText(''); setRejecting(false);
      await reload(); onChanged();
      if (action === 'submit') toast.success('Отправлено на проверку');
      if (action === 'approve') toast.success(`Подтверждено — поручение для ${employeeName} закрыто`);
      if (action === 'reject') toast.success('Вернули на доработку');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setBusy(false); }
  }

  const canSubmit = isMine && (target.status === 'open' || target.status === 'rejected');
  const canReview = isReviewer && !isMine;
  const lastReject = [...(msgs ?? [])].reverse().find(m => m.kind === 'reject');
  const isProfileTask = assignment.link === '/profile';

  return (
    <Sheet open onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col gap-0">
        <div className="px-5 pt-5 pb-3 border-b space-y-2 shrink-0">
          <div className="pr-8 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="leading-tight">{assignment.title}</SheetTitle>
              <SheetDescription className="mt-0.5">{isMine ? (assignment.created_by_name ? `Поручил: ${assignment.created_by_name}` : 'Поручение') : `Исполнитель: ${employeeName}`}</SheetDescription>
            </div>
            <StatusChip s={target.status} />
          </div>
          {assignment.description && <p className="text-sm whitespace-pre-wrap text-foreground/90">{assignment.description}</p>}
          {assignment.link && isMine && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => { onClose(); navigate(assignment.link!); }}>
              Открыть «{linkLabel(assignment.link)}»<ArrowRight size={14} className="ml-1.5" />
            </Button>
          )}
          {assignment.due_at && <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><CalendarClock size={12} />Срок: {new Date(assignment.due_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: KZ })}</p>}
          {isMine && target.status === 'rejected' && lastReject?.text && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800"><b>Что исправить:</b> {lastReject.text}</div>
          )}
          {/* Проверка профиля: всё, что сотрудник заполнил, — прямо здесь */}
          {canReview && isProfileTask && (
            <div className="rounded-lg border bg-muted/30 p-3 flex gap-3">
              <UserAvatar name={employeeName} url={employee?.avatar_url} size={64} />
              <div className="min-w-0 text-sm space-y-0.5">
                <div className="font-medium">{employeeName}</div>
                {!employee?.avatar_url && <div className="text-xs text-red-600">Фото не поставлено</div>}
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={11} />{employee?.phone || <span className="text-red-600">телефон не указан</span>}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Cake size={11} />{employee?.birthday ? new Date(employee.birthday + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : <span className="text-red-600">дата рождения не указана</span>}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={11} />{employee?.city || <span className="text-red-600">город не указан</span>}</div>
                <div className="text-xs">{employee?.about ? <span className="text-foreground/80">«{employee.about}»</span> : <span className="text-red-600">«о себе» пусто</span>}</div>
              </div>
            </div>
          )}
        </div>

        {/* переписка */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 bg-muted/20">
          {msgs === null ? <div className="h-10 rounded-lg bg-muted animate-pulse" /> :
            msgs.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">Здесь будет переписка по этому поручению</p> :
              msgs.map(m => {
                const own = (m.author_name ?? '') === (me ?? '');
                if (m.kind !== 'message') {
                  const meta = { submit: ['отметил(а) «Готово»', 'text-amber-800 bg-amber-50 border-amber-200', Check], reject: ['вернул(а) на доработку', 'text-red-700 bg-red-50 border-red-200', X], approve: ['подтвердил(а) — закрыто', 'text-emerald-700 bg-emerald-50 border-emerald-200', Check], reopen: ['открыл(а) заново', 'text-muted-foreground bg-background border-border', RotateCcw] }[m.kind] as [string, string, typeof Check];
                  const I = meta[2];
                  return (
                    <div key={m.id} className={`rounded-lg border px-3 py-2 text-xs ${meta[1]}`}>
                      <div className="flex items-center gap-1.5 font-medium"><I size={13} />{m.author_name ?? '—'} {meta[0]}<span className="ml-auto font-normal opacity-70">{when(m.created_at)}</span></div>
                      {m.text && <div className="mt-1 text-sm whitespace-pre-wrap text-foreground/90">{m.text}</div>}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${own ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-background border rounded-bl-md'}`}>
                      {!own && <div className="text-[10px] opacity-70 mb-0.5">{m.author_name}</div>}
                      <div className="whitespace-pre-wrap break-words">{m.text}</div>
                      <div className={`text-[10px] text-right mt-0.5 ${own ? 'opacity-75' : 'text-muted-foreground'}`}>{when(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
          <div ref={endRef} />
        </div>

        {/* действия */}
        <div className="border-t p-3 space-y-2 shrink-0 bg-background">
          {rejecting ? (
            <div className="space-y-2">
              <Textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Что исправить? Например: фото размытое, нет даты рождения" />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Отмена</Button>
                <Button size="sm" variant="destructive" disabled={busy || !text.trim()} onClick={() => run('reject', text)}>Вернуть на доработку</Button>
              </div>
            </div>
          ) : (<>
            {canSubmit && (
              <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => run('submit', text)}>
                <Check size={17} className="mr-1.5" />Готово — отправить на проверку
              </Button>
            )}
            {canReview && target.status === 'submitted' && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11 text-red-600 border-red-200 hover:bg-red-50" disabled={busy} onClick={() => { setRejecting(true); setText(''); }}><X size={16} className="mr-1.5" />Вернуть</Button>
                <Button className="h-11 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => run('approve')}><Check size={16} className="mr-1.5" />Подтвердить</Button>
              </div>
            )}
            {canReview && target.status === 'approved' && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" disabled={busy} onClick={() => run('reopen')}><RotateCcw size={13} className="mr-1.5" />Открыть заново</Button>
            )}
            {canReview && (target.status === 'open' || target.status === 'rejected') && (
              <p className="text-[11px] text-muted-foreground text-center">Ждём, пока {employeeName} нажмёт «Готово»</p>
            )}
            {isMine && target.status === 'submitted' && <p className="text-[11px] text-muted-foreground text-center">Отправлено на проверку — ждём ответа</p>}
            {isMine && target.status === 'approved' && <p className="text-[11px] text-emerald-700 text-center">Подтверждено — поручение закрыто 👍</p>}
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (text.trim()) run('message', text); }}>
              <Input value={text} onChange={e => setText(e.target.value)} placeholder={canSubmit ? 'Комментарий (отправится с «Готово») или вопрос' : 'Написать сообщение'} className="h-10" />
              <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={busy || !text.trim()} aria-label="Отправить"><Send size={16} /></Button>
            </form>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Новое поручение: что сделать, куда вести, срок и кому */
function NewAssignmentDialog({ open, onOpenChange, managers, profiles, me, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; managers: Manager[]; profiles: Profile[]; me: string | null; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [link, setLink] = useState('');
  const [due, setDue] = useState('');
  const [who, setWho] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setTitle(''); setDesc(''); setLink(''); setDue(''); setWho([]); } }, [open]);

  // поручать можно тем, у кого есть вход на сайт
  const people = managers.filter(m => profiles.some(p => p.manager_id === m.id)).sort((a, b) => a.name.localeCompare(b.name));
  const all = people.length > 0 && who.length === people.length;

  async function save() {
    if (!title.trim() || !who.length) return;
    setSaving(true);
    try {
      await createAssignment({
        title: title.trim(), description: desc.trim() || null, link: link || null,
        due_at: due ? new Date(`${due}T23:59:00+05:00`).toISOString() : null, created_by_name: me,
      }, who);
      toast.success(`Поручение отправлено: ${who.length} ${who.length === 1 ? 'сотруднику' : 'сотрудникам'}`);
      notifyCountersChanged();
      onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось создать'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новое поручение</DialogTitle>
          <DialogDescription>Сотрудники увидят его в «Сообщениях», сделают и нажмут «Готово» — вы проверите и подтвердите или вернёте.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); save(); }}>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map(t => (
              <button key={t.title} type="button" onClick={() => { setTitle(t.title); setDesc(t.description); setLink(t.link); }}
                className="h-8 px-3 rounded-full border text-xs hover:bg-muted inline-flex items-center gap-1"><UserRound size={12} />{t.title}</button>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Что сделать</span>
            <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Например: заполнить профиль и поставить фото" className="h-10" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Подробнее <span className="text-muted-foreground font-normal">— необязательно</span></span>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} maxLength={4000} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Куда вести</span>
              <select value={link} onChange={e => setLink(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                {LINKS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Срок <span className="text-muted-foreground font-normal">— необяз.</span></span>
              <Input type="date" value={due} min={kzDate(new Date())} onChange={e => setDue(e.target.value)} className="h-10" />
            </label>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center">
              <span className="text-sm font-medium">Кому</span>
              <button type="button" className="ml-auto text-xs text-primary" onClick={() => setWho(all ? [] : people.map(p => p.id))}>{all ? 'Снять всех' : 'Выбрать всех'}</button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
              {people.map(m => {
                const on = who.includes(m.id);
                const p = profiles.find(x => x.manager_id === m.id);
                return (
                  <button key={m.id} type="button" onClick={() => setWho(w => on ? w.filter(x => x !== m.id) : [...w, m.id])}
                    className={`h-12 rounded-lg border px-2 flex items-center gap-2 text-left transition-colors ${on ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted'}`}>
                    <UserAvatar name={m.name} url={p?.avatar_url} size={28} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{m.role}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {people.length === 0 && <p className="text-xs text-muted-foreground">Нет сотрудников со входом на сайт</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={saving || !title.trim() || !who.length}>{saving ? 'Отправляю…' : `Поручить${who.length ? ` (${who.length})` : ''}`}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
