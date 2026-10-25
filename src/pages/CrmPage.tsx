import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Search, Phone, CalendarClock, AlertTriangle, LayoutGrid, ListChecks, Clock, Trophy, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getManagers } from '@/lib/api';
import type { Manager } from '@/types/types';
import { formatCurrency } from '@/lib/utils';
import LeadSheet from '@/components/pipeline/LeadSheet';
import {
  type CrmLead, type CrmStage, type CrmPipeline, type CrmTask, type TaskKind,
  getPipeline, getLeads, createLead, updateLead, getTasks, createTask, SOURCES, TASK_KINDS, taskKindLabel,
  dueLabel, isOverdue, normPhone, showPhone, daysOnStage, todayKey, kzDayKey,
} from '@/lib/crm';

const field = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export default function CrmPage() {
  const { profile, canViewAllManagers } = useAuth();
  const myId = profile?.manager_id ?? null;
  const [params, setParams] = useSearchParams();
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [lostReasons, setLostReasons] = useState<string[]>([]);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [q, setQ] = useState('');
  const [mgrFilter, setMgrFilter] = useState<string>('');
  const [view, setView] = useState<'board' | 'tasks'>(params.get('view') === 'tasks' ? 'tasks' : 'board');
  const [showClosed, setShowClosed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(params.get('lead'));
  const [creating, setCreating] = useState(false);
  const dragId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // открыть лид по ссылке ?lead=
  useEffect(() => {
    const n = new URLSearchParams(params);
    if (openId) n.set('lead', openId); else n.delete('lead');
    if (view === 'tasks') n.set('view', 'tasks'); else n.delete('view');
    setParams(n, { replace: true });
  }, [openId, view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getPipeline().then(p => {
      setPipelines(p.pipelines); setStages(p.stages); setLostReasons(p.lostReasons);
      setPipelineId(prev => prev || p.pipelines[0]?.id || '');
    }).catch(e => toast.error(e.message));
    getManagers().then(m => setManagers(m.filter(x => x.is_active !== false))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!pipelineId) return;
    try {
      const [ls, ts] = await Promise.all([getLeads(pipelineId), getTasks({ open: true })]);
      setLeads(ls); setTasks(ts);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось загрузить'); setLeads([]); }
  }, [pipelineId]);
  useEffect(() => { load(); }, [load]);

  const pipeStages = useMemo(() => stages.filter(s => s.pipeline_id === pipelineId).sort((a, b) => a.sort - b.sort), [stages, pipelineId]);
  const visibleStages = pipeStages.filter(s => showClosed || s.kind === 'open');
  const nextTaskByLead = useMemo(() => {
    const m = new Map<string, CrmTask>();
    for (const t of tasks) { const cur = m.get(t.lead_id); if (!cur || t.due_at < cur.due_at) m.set(t.lead_id, t); }
    return m;
  }, [tasks]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase(), digits = q.replace(/\D/g, '');
    return (leads ?? []).filter(l =>
      (!mgrFilter || l.manager_id === mgrFilter) &&
      (!s || l.client_name.toLowerCase().includes(s) || (digits.length >= 3 && (l.client_phone ?? '').replace(/\D/g, '').includes(digits)) || (l.address ?? '').toLowerCase().includes(s)));
  }, [leads, q, mgrFilter]);

  const managerName = (id: string | null) => managers.find(m => m.id === id)?.name ?? '';

  async function moveLead(id: string, stage: CrmStage) {
    const l = leads?.find(x => x.id === id);
    if (!l || l.stage_id === stage.id) return;
    if (stage.kind !== 'open') { setOpenId(id); toast.info(stage.kind === 'won' ? 'Укажите сумму — сделка уйдёт в «Подтверждения»' : 'Укажите причину отказа'); return; }
    setLeads(prev => prev?.map(x => x.id === id ? { ...x, stage_id: stage.id, stage_changed_at: new Date().toISOString() } : x) ?? null);
    try { await updateLead(id, { stage_id: stage.id }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось перенести'); load(); }
  }

  const onChanged = (l: CrmLead) => { setLeads(prev => prev?.map(x => x.id === l.id ? l : x) ?? null); getTasks({ open: true }).then(setTasks).catch(() => {}); };

  // Задачи (вкладка): просроченные, сегодня, дальше
  const myTasks = useMemo(() => tasks.filter(t => (canViewAllManagers ? (!mgrFilter || t.manager_id === mgrFilter) : true)), [tasks, mgrFilter, canViewAllManagers]);
  const leadById = useMemo(() => new Map((leads ?? []).map(l => [l.id, l])), [leads]);
  const overdue = myTasks.filter(isOverdue);
  const today = myTasks.filter(t => !isOverdue(t) && kzDayKey(t.due_at) === todayKey());
  const later = myTasks.filter(t => !isOverdue(t) && kzDayKey(t.due_at) !== todayKey());
  const noTask = (leads ?? []).filter(l => pipeStages.find(s => s.id === l.stage_id)?.kind === 'open' && !nextTaskByLead.has(l.id) && (!mgrFilter || l.manager_id === mgrFilter));

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold">CRM</h1>
            <p className="text-sm text-muted-foreground">Лиды до продажи: воронка, задачи, история клиента</p>
          </div>
          <Button className="h-10" onClick={() => setCreating(true)}><Plus size={16} className="mr-1.5" />Лид</Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
            <button type="button" onClick={() => setView('board')} className={`h-8 px-3 rounded-md text-sm inline-flex items-center gap-1.5 ${view === 'board' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}><LayoutGrid size={14} />Воронка</button>
            <button type="button" onClick={() => setView('tasks')} className={`h-8 px-3 rounded-md text-sm inline-flex items-center gap-1.5 ${view === 'tasks' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>
              <ListChecks size={14} />Задачи{overdue.length > 0 && <span className="ml-1 text-[10px] px-1.5 rounded-full bg-red-500 text-white">{overdue.length}</span>}
            </button>
          </div>
          {pipelines.length > 1 && (
            <select value={pipelineId} onChange={e => setPipelineId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Имя, телефон, адрес" className="h-9 pl-8" />
          </div>
          {canViewAllManagers && (
            <select value={mgrFilter} onChange={e => setMgrFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Все менеджеры</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          {view === 'board' && (
            <label className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />Закрытые</label>
          )}
        </div>

        {leads === null ? (
          <div className="flex gap-3 overflow-hidden">{[1, 2, 3, 4].map(i => <div key={i} className="h-64 w-72 shrink-0 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : view === 'board' ? (
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none" style={{ minHeight: 'calc(100dvh - 260px)' }}>
            {visibleStages.map(s => {
              const items = filtered.filter(l => l.stage_id === s.id);
              const sum = items.reduce((a, l) => a + Number(l.amount || 0), 0);
              return (
                <div key={s.id} className={`snap-start shrink-0 w-[82vw] sm:w-72 rounded-xl flex flex-col transition-colors ${dragOver === s.id ? 'bg-primary/5 ring-2 ring-primary/30' : 'bg-muted/40'}`}
                  style={{ borderTop: `3px solid ${s.color}` }}
                  onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
                  onDragLeave={() => setDragOver(p => (p === s.id ? null : p))}
                  onDrop={e => { e.preventDefault(); setDragOver(null); if (dragId.current) moveLead(dragId.current, s); dragId.current = null; }}>
                  <div className="px-3 pt-2.5 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{s.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5">{items.length}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{sum > 0 ? formatCurrency(sum) : '—'}</div>
                  </div>
                  <div className="px-2 pb-2 space-y-2 flex-1 overflow-y-auto">
                    {items.map(l => {
                      const t = nextTaskByLead.get(l.id);
                      const late = t && isOverdue(t);
                      return (
                        <div key={l.id} draggable onDragStart={() => { dragId.current = l.id; }} onClick={() => setOpenId(l.id)}
                          className="rounded-lg border bg-background p-2.5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{l.client_name}</div>
                              <div className="text-xs text-muted-foreground truncate">{[showPhone(l.client_phone), l.source].filter(Boolean).join(' · ')}</div>
                            </div>
                            {l.amount > 0 && <span className="text-xs font-semibold tabular-nums shrink-0">{formatCurrency(l.amount)}</span>}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                            {s.kind === 'won' ? <span className="text-emerald-700 inline-flex items-center gap-1"><Trophy size={11} />успешно</span>
                              : s.kind === 'lost' ? <span className="text-red-600 inline-flex items-center gap-1 truncate"><XCircle size={11} />{l.lost_reason ?? 'отказ'}</span>
                              : t ? <span className={`inline-flex items-center gap-1 truncate ${late ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}><CalendarClock size={11} />{taskKindLabel(t.kind)} {dueLabel(t.due_at)}</span>
                              : <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={11} />нет задачи</span>}
                            <span className="ml-auto text-muted-foreground shrink-0 inline-flex items-center gap-0.5" title="дней на этапе"><Clock size={10} />{daysOnStage(l)}д</span>
                          </div>
                          {canViewAllManagers && l.manager_id && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{managerName(l.manager_id)}</div>}
                        </div>
                      );
                    })}
                    {!items.length && <p className="text-xs text-muted-foreground px-1 py-3 text-center">Пусто</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: 'Просрочено', list: overdue, cls: 'text-red-600' },
              { title: 'Сегодня', list: today, cls: '' },
              { title: 'Дальше', list: later, cls: 'text-muted-foreground' },
            ].map(g => (
              <section key={g.title} className="rounded-xl border bg-card">
                <h2 className={`px-4 py-3 border-b text-sm font-semibold ${g.cls}`}>{g.title} <span className="text-muted-foreground font-normal">{g.list.length}</span></h2>
                <div className="divide-y">
                  {g.list.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground text-center">Нет задач</p>}
                  {g.list.map(t => {
                    const l = leadById.get(t.lead_id);
                    return (
                      <button key={t.id} type="button" onClick={() => setOpenId(t.lead_id)} className="w-full text-left px-4 py-2.5 hover:bg-muted/40 flex items-center gap-3">
                        <CalendarClock size={16} className={isOverdue(t) ? 'text-red-600' : 'text-muted-foreground'} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{t.title} · {l?.client_name ?? 'лид'}</div>
                          <div className={`text-xs ${isOverdue(t) ? 'text-red-600' : 'text-muted-foreground'}`}>{dueLabel(t.due_at)}{canViewAllManagers && t.manager_id ? ` · ${managerName(t.manager_id)}` : ''}</div>
                        </div>
                        {l?.client_phone && <a href={`tel:${l.client_phone}`} onClick={e => e.stopPropagation()} className="h-9 w-9 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Позвонить"><Phone size={15} /></a>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            <section className="rounded-xl border bg-card">
              <h2 className="px-4 py-3 border-b text-sm font-semibold text-amber-700">Лиды без задачи <span className="text-muted-foreground font-normal">{noTask.length}</span></h2>
              <div className="divide-y">
                {noTask.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground text-center">У всех открытых лидов есть следующий шаг</p>}
                {noTask.map(l => (
                  <button key={l.id} type="button" onClick={() => setOpenId(l.id)} className="w-full text-left px-4 py-2.5 hover:bg-muted/40">
                    <div className="text-sm font-medium truncate">{l.client_name}</div>
                    <div className="text-xs text-muted-foreground">{pipeStages.find(s => s.id === l.stage_id)?.name} · {daysOnStage(l)} дн. на этапе</div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <LeadSheet leadId={openId} stages={stages} lostReasons={lostReasons} managers={managers} onClose={() => setOpenId(null)} onChanged={onChanged} />

      <NewLeadDialog open={creating} onOpenChange={setCreating} stages={pipeStages} managers={managers} defaultManager={myId}
        canPickManager={canViewAllManagers} pipelineId={pipelineId}
        onCreated={l => { setLeads(prev => [l, ...(prev ?? [])]); getTasks({ open: true }).then(setTasks).catch(() => {}); setOpenId(l.id); }} />
    </AppLayout>
  );
}

function NewLeadDialog({ open, onOpenChange, stages, managers, defaultManager, canPickManager, pipelineId, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; stages: CrmStage[]; managers: Manager[]; defaultManager: string | null;
  canPickManager: boolean; pipelineId: string; onCreated: (l: CrmLead) => void;
}) {
  const [f, setF] = useState({ name: '', phone: '', source: '', amount: '', manager: '', stage: '', comment: '', task: 'call' as TaskKind | '', due: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const now = new Date(Date.now() + 3600000);
    const due = `${now.toLocaleDateString('en-CA', { timeZone: 'Asia/Qyzylorda' })}T${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qyzylorda' })}`;
    setF({ name: '', phone: '', source: '', amount: '', manager: defaultManager ?? '', stage: stages.find(s => s.kind === 'open')?.id ?? '', comment: '', task: 'call', due });
  }, [open, defaultManager, stages]);

  async function save() {
    if (!f.name.trim()) { toast.error('Укажите имя клиента'); return; }
    if (!f.manager) { toast.error('Выберите ответственного'); return; }
    setBusy(true);
    try {
      const l = await createLead({
        pipeline_id: pipelineId, stage_id: f.stage, client_name: f.name.trim(), client_phone: f.phone.trim() ? normPhone(f.phone) : null,
        source: f.source || null, amount: Number(f.amount.replace(/\D/g, '')) || 0, manager_id: f.manager, comment: f.comment.trim() || null,
      });
      if (f.task && f.due) {
        await createTask({ lead_id: l.id, manager_id: f.manager, kind: f.task, title: taskKindLabel(f.task), due_at: new Date(`${f.due}:00+05:00`).toISOString() });
      }
      toast.success('Лид создан');
      onOpenChange(false);
      onCreated(l);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось создать'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Новый лид</DialogTitle><DialogDescription>Клиент, который обратился, но ещё не купил.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); save(); }}>
          <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Имя клиента" className="h-11" autoComplete="off" />
          <Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="Телефон" inputMode="tel" className="h-11" autoComplete="off" />
          <div className="grid grid-cols-2 gap-2">
            <select value={f.source} onChange={e => setF({ ...f, source: e.target.value })} className={field}>
              <option value="">Источник</option>{SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
            <Input value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="Бюджет, ₸" inputMode="numeric" className="h-10" />
          </div>
          <select value={f.stage} onChange={e => setF({ ...f, stage: e.target.value })} className={field}>
            {stages.filter(s => s.kind === 'open').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {canPickManager && (
            <select value={f.manager} onChange={e => setF({ ...f, manager: e.target.value })} className={field}>
              <option value="">Ответственный</option>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <Input value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} placeholder="Что интересует (необязательно)" className="h-10" />
          <div className="rounded-lg border p-2.5 space-y-2 bg-muted/30">
            <div className="text-xs font-medium text-muted-foreground">Первый шаг</div>
            <div className="flex gap-2">
              <select value={f.task} onChange={e => setF({ ...f, task: e.target.value as TaskKind | '' })} className={`${field} w-36`}>
                <option value="">Без задачи</option>{TASK_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              {f.task && <input type="datetime-local" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} className={`${field} flex-1`} />}
            </div>
          </div>
          <Button type="submit" className="w-full h-11" disabled={busy}>{busy ? 'Сохраняю…' : 'Создать лид'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
