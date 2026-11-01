import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Search, Phone, CalendarClock, AlertTriangle, LayoutGrid, ListChecks, Clock, Trophy, XCircle,
  MessageCircle, ChevronRight, UserRound, X, Settings2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getManagers } from '@/lib/api';
import { supabase } from '@/db/supabase';
import type { Manager } from '@/types/types';
import { formatCurrency } from '@/lib/utils';
import LeadSheet from '@/components/pipeline/LeadSheet';
import WhatsAppSetup from '@/components/pipeline/WhatsAppSetup';
import SuccessfulSales from '@/components/pipeline/SuccessfulSales';
import {
  type CrmLead, type CrmStage, type CrmPipeline, type CrmTask, type TaskKind,
  getPipeline, getLeads, createLead, updateLead, getTasks, createTask, completeTask, addEvent, SOURCES, TASK_KINDS, taskKindLabel,
  dueLabel, isOverdue, normPhone, showPhone, daysOnStage, todayKey, kzDayKey, DUE_PRESETS,
} from '@/lib/crm';

const field = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const waLink = (p: string | null) => { const d = (p ?? '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `https://wa.me/7${d}` : null; };
const telLink = (p: string | null) => { const d = (p ?? '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `tel:+7${d}` : null; };

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export default function CrmPage() {
  const { profile, seesAll, editsAll, isDirector } = useAuth();
  const [waOpen, setWaOpen] = useState(false);
  const canViewAllManagers = seesAll('crm'), canEditAllLeads = editsAll('crm');
  const myId = profile?.manager_id ?? null;
  const me = profile?.name && profile.name !== 'admin' ? profile.name : (profile?.email ?? null);
  const isMobile = useIsMobile();
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
  const [view, setView] = useState<'board' | 'tasks' | 'won'>(params.get('view') === 'tasks' ? 'tasks' : params.get('view') === 'won' ? 'won' : 'board');
  const [showClosed, setShowClosed] = useState(false);
  const [quick, setQuick] = useState<'all' | 'overdue' | 'notask' | 'unread' | 'today'>('all');
  const [openId, setOpenId] = useState<string | null>(params.get('lead'));
  const [openTab, setOpenTab] = useState<'card' | 'chat'>('card');
  const [creating, setCreating] = useState<{ stageId?: string } | null>(null);
  const [mobileStage, setMobileStage] = useState<string>('');
  const dragId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => {
    const n = new URLSearchParams(params);
    if (openId) n.set('lead', openId); else n.delete('lead');
    if (view !== 'board') n.set('view', view); else n.delete('view');
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
  // Новые лиды из WhatsApp и новые сообщения появляются сами
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel('crm-leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_leads' }, () => { if (t) clearTimeout(t); t = setTimeout(load, 600); })
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [load]);

  const pipeStages = useMemo(() => stages.filter(s => s.pipeline_id === pipelineId).sort((a, b) => a.sort - b.sort), [stages, pipelineId]);
  const visibleStages = pipeStages.filter(s => showClosed || s.kind === 'open');
  useEffect(() => { if (!mobileStage && visibleStages[0]) setMobileStage(visibleStages[0].id); }, [visibleStages, mobileStage]);

  const nextTaskByLead = useMemo(() => {
    const m = new Map<string, CrmTask>();
    for (const t of tasks) { const cur = m.get(t.lead_id); if (!cur || t.due_at < cur.due_at) m.set(t.lead_id, t); }
    return m;
  }, [tasks]);

  const base = useMemo(() => {
    const s = q.trim().toLowerCase(), digits = q.replace(/\D/g, '');
    return (leads ?? []).filter(l =>
      (!mgrFilter || l.manager_id === mgrFilter) &&
      (!s || l.client_name.toLowerCase().includes(s) || (digits.length >= 3 && (l.client_phone ?? '').replace(/\D/g, '').includes(digits)) || (l.address ?? '').toLowerCase().includes(s)));
  }, [leads, q, mgrFilter]);
  // Быстрые фильтры над воронкой: что требует внимания прямо сейчас
  const isOpenLead = (l: CrmLead) => stages.find(s => s.id === l.stage_id)?.kind === 'open';
  const quickTest = useMemo(() => ({
    all: () => true,
    overdue: (l: CrmLead) => { const t = nextTaskByLead.get(l.id); return !!t && isOverdue(t); },
    notask: (l: CrmLead) => isOpenLead(l) && !nextTaskByLead.has(l.id),
    unread: (l: CrmLead) => !!l.unread,
    today: (l: CrmLead) => { const t = nextTaskByLead.get(l.id); return !!t && !isOverdue(t) && kzDayKey(t.due_at) === todayKey(); },
  }), [nextTaskByLead, stages]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => base.filter(quickTest[quick]), [base, quick, quickTest]);
  const quickCount = (k: keyof typeof quickTest) => base.filter(l => isOpenLead(l) || k === 'unread').filter(quickTest[k]).length;
  // Сначала лиды с просроченной задачей, потом без задачи, потом по ближайшей задаче
  const sortLeads = (list: CrmLead[]) => [...list].sort((a, b) => {
    const ua = a.unread ? 1 : 0, ub = b.unread ? 1 : 0;
    if (ua !== ub) return ub - ua;
    const ta = nextTaskByLead.get(a.id), tb = nextTaskByLead.get(b.id);
    const ra = ta ? (isOverdue(ta) ? 0 : 2) : 1, rb = tb ? (isOverdue(tb) ? 0 : 2) : 1;
    if (ra !== rb) return ra - rb;
    return (ta?.due_at ?? b.updated_at).localeCompare(tb?.due_at ?? a.updated_at);
  });

  const managerName = (id: string | null) => managers.find(m => m.id === id)?.name ?? '';

  async function moveLead(id: string, stage: CrmStage) {
    const l = leads?.find(x => x.id === id);
    if (!l || l.stage_id === stage.id) return;
    if (stage.kind !== 'open') { setOpenId(id); toast.info(stage.kind === 'won' ? 'Укажите сумму — сделка уйдёт в «Подтверждения»' : 'Укажите причину отказа'); return; }
    setLeads(prev => prev?.map(x => x.id === id ? { ...x, stage_id: stage.id, stage_changed_at: new Date().toISOString() } : x) ?? null);
    try { await updateLead(id, { stage_id: stage.id }); toast.success(`→ ${stage.name}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось перенести'); load(); }
  }
  const nextStage = (l: CrmLead) => {
    const open = pipeStages.filter(s => s.kind === 'open');
    const i = open.findIndex(s => s.id === l.stage_id);
    return i >= 0 && i < open.length - 1 ? open[i + 1] : null;
  };

  async function doneTask(t: CrmTask) {
    setTasks(prev => prev.filter(x => x.id !== t.id));
    try {
      await completeTask(t.id, null);
      await addEvent(t.lead_id, 'task_done', `Выполнено: ${t.title}`, me);
      toast.success('Задача выполнена', { action: { label: 'Следующий шаг', onClick: () => setOpenId(t.lead_id) } });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); load(); }
  }

  const onChanged = (l: CrmLead) => { setLeads(prev => prev?.map(x => x.id === l.id ? l : x) ?? null); getTasks({ open: true }).then(setTasks).catch(() => {}); };

  const myTasks = useMemo(() => tasks.filter(t => (!mgrFilter || t.manager_id === mgrFilter)), [tasks, mgrFilter]);
  const leadById = useMemo(() => new Map((leads ?? []).map(l => [l.id, l])), [leads]);
  const overdue = myTasks.filter(isOverdue);
  const today = myTasks.filter(t => !isOverdue(t) && kzDayKey(t.due_at) === todayKey());
  const later = myTasks.filter(t => !isOverdue(t) && kzDayKey(t.due_at) !== todayKey());
  const noTask = (leads ?? []).filter(l => pipeStages.find(s => s.id === l.stage_id)?.kind === 'open' && !nextTaskByLead.has(l.id) && (!mgrFilter || l.manager_id === mgrFilter));

  /** Карточка лида в воронке */
  const LeadCard = ({ l, s }: { l: CrmLead; s: CrmStage }) => {
    const t = nextTaskByLead.get(l.id);
    const late = t && isOverdue(t);
    const mine = canEditAllLeads || l.manager_id === (profile?.manager_id ?? null);
    const nx = s.kind === 'open' && mine ? nextStage(l) : null;
    const tel = telLink(l.client_phone), wa = waLink(l.client_phone);
    const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const mName = l.manager_id ? managerName(l.manager_id) : '';
    // Следующий шаг — главное на карточке: что сделать и когда
    const next = s.kind === 'won' ? { cls: 'bg-emerald-50 text-emerald-800', icon: Trophy, text: 'Успешно' }
      : s.kind === 'lost' ? { cls: 'bg-red-50 text-red-700', icon: XCircle, text: l.lost_reason ? `Отказ: ${l.lost_reason}` : 'Отказ' }
      : t ? { cls: late ? 'bg-red-50 text-red-700 font-medium' : 'bg-muted text-foreground/80', icon: CalendarClock, text: `${late ? 'Просрочено: ' : ''}${t.title !== taskKindLabel(t.kind) ? t.title : taskKindLabel(t.kind)} · ${dueLabel(t.due_at)}` }
      : { cls: 'bg-amber-50 text-amber-800', icon: AlertTriangle, text: 'Нет следующего шага' };
    const NI = next.icon;
    return (
      <div draggable={!isMobile && mine} onDragStart={() => { dragId.current = l.id; }} onClick={() => setOpenId(l.id)}
        className={`group rounded-xl border bg-background p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer ${l.unread ? 'ring-1 ring-emerald-500/50' : ''}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] md:text-sm font-semibold truncate">{l.client_name}</div>
            <div className="text-xs text-muted-foreground truncate">{[showPhone(l.client_phone), l.source].filter(Boolean).join(' · ')}</div>
          </div>
          {!!l.unread ? <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[11px] font-semibold inline-flex items-center justify-center" title="Новые сообщения">{l.unread}</span>
            : l.amount > 0 && <span className="text-xs font-semibold tabular-nums shrink-0">{formatCurrency(l.amount)}</span>}
        </div>
        {l.last_message_text && (
          <div className={`mt-1.5 text-xs truncate flex items-center gap-1 ${l.unread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            <MessageCircle size={11} className="shrink-0 text-emerald-600" />{l.last_message_text}
          </div>
        )}
        <div className={`mt-2 rounded-md px-2 py-1 text-xs flex items-center gap-1.5 ${next.cls}`}>
          <NI size={12} className="shrink-0" /><span className="truncate">{next.text}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 -mb-1" onClick={e => e.stopPropagation()}>
          {canViewAllManagers && mName && (
            <span className="h-5 w-5 rounded-full bg-muted text-[9px] font-semibold text-muted-foreground flex items-center justify-center shrink-0" title={`Ответственный: ${mName}`}>{initials(mName)}</span>
          )}
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5 shrink-0" title="Сколько дней лид на этом этапе"><Clock size={11} />{daysOnStage(l)} дн.</span>
          <span className="ml-auto inline-flex items-center gap-0.5">
            {tel && <a href={tel} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground" title="Позвонить" aria-label="Позвонить"><Phone size={15} /></a>}
            {wa && <button type="button" onClick={() => { setOpenTab('chat'); setOpenId(l.id); }} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-emerald-600" title="Переписка" aria-label="Переписка"><MessageCircle size={15} /></button>}
            {nx && (
              <button type="button" onClick={() => moveLead(l.id, nx)} title={`Перенести на «${nx.name}»`}
                className={`shrink-0 h-8 px-1.5 rounded-lg text-xs items-center gap-0.5 text-primary hover:bg-primary/10 ${isMobile ? 'inline-flex' : 'hidden group-hover:inline-flex'}`}>
                Дальше<ChevronRight size={14} />
              </button>
            )}
          </span>
        </div>
      </div>
    );
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
        <button type="button" onClick={() => setView('board')} className={`h-9 px-3 rounded-md text-sm inline-flex items-center gap-1.5 ${view === 'board' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}><LayoutGrid size={14} />Воронка</button>
        <button type="button" onClick={() => setView('tasks')} className={`h-9 px-3 rounded-md text-sm inline-flex items-center gap-1.5 ${view === 'tasks' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>
          <ListChecks size={14} />Задачи{(overdue.length + today.length) > 0 && <span className={`ml-1 text-[10px] px-1.5 rounded-full text-white ${overdue.length ? 'bg-red-500' : 'bg-primary'}`}>{overdue.length + today.length}</span>}
        </button>
        <button type="button" onClick={() => setView('won')} className={`h-9 px-3 rounded-md text-sm inline-flex items-center gap-1.5 ${view === 'won' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}><Trophy size={14} />Успешные</button>
      </div>
      {pipelines.length > 1 && (
        <select value={pipelineId} onChange={e => setPipelineId(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <div className="relative flex-1 min-w-[160px] md:max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск: имя, телефон, адрес" className="h-9 pl-8 pr-8" />
        {q && <button type="button" onClick={() => setQ('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Очистить"><X size={13} /></button>}
      </div>
      {canViewAllManagers && (
        <select value={mgrFilter} onChange={e => setMgrFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[160px]">
          <option value="">Все менеджеры</option>
          {myId && <option value={myId}>Мои</option>}
          {managers.filter(m => m.id !== myId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {view === 'board' && (
        <label className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />Закрытые</label>
      )}
      {isDirector && (
        <Button variant="outline" className="h-9 md:ml-auto px-3" title="Подключение WhatsApp" onClick={() => setWaOpen(true)}><Settings2 size={15} /><span className="hidden sm:inline ml-1.5">WhatsApp</span></Button>
      )}
      <Button className={`h-9 hidden md:inline-flex ${isDirector ? '' : 'ml-auto'}`} onClick={() => setCreating({})}><Plus size={16} className="mr-1.5" />Новый лид</Button>
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">CRM</h1>
            <p className="text-sm text-muted-foreground">Лиды по этапам: кто следующий шаг, что просрочено, кому ответить</p>
          </div>
        </div>
        {toolbar}
        {leads && view === 'board' && (
          /* Сводка — она же быстрые фильтры */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {([
              ['all', 'В работе', base.filter(isOpenLead).length, formatCurrency(base.filter(isOpenLead).reduce((a, l) => a + Number(l.amount || 0), 0)), 'text-foreground', LayoutGrid],
              ['overdue', 'Просрочено', quickCount('overdue'), 'задача не сделана вовремя', 'text-red-600', AlertTriangle],
              ['today', 'Дела на сегодня', quickCount('today'), 'звонки и встречи', 'text-blue-600', CalendarClock],
              ['notask', 'Без следующего шага', quickCount('notask'), 'клиент может потеряться', 'text-amber-600', Clock],
              ['unread', 'Новые сообщения', quickCount('unread'), 'ждут ответа', 'text-emerald-600', MessageCircle],
            ] as const).map(([k, label, n, sub, tone, Icon]) => {
              const act = quick === k;
              return (
                <button key={k} type="button" onClick={() => setQuick(act && k !== 'all' ? 'all' : k)}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-all ${act ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : 'bg-card hover:border-primary/30'}`}>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon size={13} className={n ? tone : ''} />{label}</div>
                  <div className={`text-xl font-semibold tabular-nums leading-tight mt-0.5 ${n && k !== 'all' ? tone : ''}`}>{n}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                </button>
              );
            })}
          </div>
        )}

        {view === 'won' ? (
          <SuccessfulSales managers={managers} mgrFilter={mgrFilter} search={q} />
        ) : leads && leads.length === 0 && (
          /* Пустая CRM — понятный старт вместо пустых колонок */
          <div className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center"><UserRound size={22} /></div>
            <h2 className="mt-3 text-base font-semibold">В CRM пока нет лидов</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Добавьте клиента вручную — он появится на первом этапе с задачей «связаться».
              {isDirector ? ' Подключите WhatsApp — новые обращения будут попадать сюда сами.' : ''}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setCreating({})}><Plus size={16} className="mr-1.5" />Новый лид</Button>
              {isDirector && <Button variant="outline" onClick={() => setWaOpen(true)}><MessageCircle size={16} className="mr-1.5" />Подключить WhatsApp</Button>}
            </div>
          </div>
        )}

        {view === 'won' || (leads !== null && leads.length === 0) ? null : leads === null ? (
          <div className="flex gap-3 overflow-hidden">{[1, 2, 3, 4].map(i => <div key={i} className="h-64 w-72 shrink-0 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : view === 'board' && isMobile ? (
          /* Телефон: этапы вкладками, лиды списком на всю ширину */
          <div className="space-y-3">
            <div className="tabs-scroll flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 sticky top-0 z-10 bg-background/95 backdrop-blur py-1">
              {visibleStages.map(s => {
                const n = filtered.filter(l => l.stage_id === s.id).length;
                const act = s.id === mobileStage;
                return (
                  <button key={s.id} type="button" onClick={() => setMobileStage(s.id)}
                    className={`shrink-0 h-9 px-3 rounded-full text-sm border inline-flex items-center gap-1.5 ${act ? 'text-white border-transparent font-medium' : 'bg-background'}`}
                    style={act ? { background: s.color } : { borderColor: `${s.color}88` }}>
                    {s.name}<span className={`text-xs ${act ? 'text-white/85' : 'text-muted-foreground'}`}>{n}</span>
                  </button>
                );
              })}
            </div>
            {(() => {
              const s = visibleStages.find(x => x.id === mobileStage) ?? visibleStages[0];
              if (!s) return null;
              const items = sortLeads(filtered.filter(l => l.stage_id === s.id));
              return (<>
                <div className="flex items-center text-xs text-muted-foreground px-0.5">
                  <span>{items.length} лидов · {formatCurrency(items.reduce((a, l) => a + Number(l.amount || 0), 0))}</span>
                  {s.kind === 'open' && <button type="button" className="ml-auto text-primary inline-flex items-center gap-1" onClick={() => setCreating({ stageId: s.id })}><Plus size={13} />Добавить сюда</button>}
                </div>
                <div className="space-y-2 pb-24">
                  {items.map(l => <LeadCard key={l.id} l={l} s={s} />)}
                  {!items.length && <p className="text-sm text-muted-foreground text-center py-10">На этом этапе пока никого</p>}
                </div>
              </>);
            })()}
          </div>
        ) : view === 'board' ? (
          /* Компьютер: канбан с перетаскиванием */
          <div className="flex gap-2.5 overflow-x-auto pb-3 items-start">
            {visibleStages.map(s => {
              const items = sortLeads(filtered.filter(l => l.stage_id === s.id));
              const sum = items.reduce((a, l) => a + Number(l.amount || 0), 0);
              return (
                <div key={s.id} className={`shrink-0 ${items.length ? 'w-64' : 'w-52'} rounded-xl flex flex-col transition-all max-h-[calc(100dvh-260px)] ${dragOver === s.id ? 'bg-primary/5 ring-2 ring-primary/30' : 'bg-muted/40'}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
                  onDragLeave={() => setDragOver(p => (p === s.id ? null : p))}
                  onDrop={e => { e.preventDefault(); setDragOver(null); if (dragId.current) moveLead(dragId.current, s); dragId.current = null; }}>
                  <div className="px-2.5 pt-2.5 pb-1.5 flex items-start gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5" title={s.name}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-[13px] font-semibold leading-tight line-clamp-2">{s.name}</span>
                        <span className={`ml-auto text-[11px] tabular-nums px-1.5 rounded-full ${items.length ? 'bg-background text-foreground' : 'text-muted-foreground'}`}>{items.length}</span>
                      </div>
                      {sum > 0 && <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{formatCurrency(sum)}</div>}
                    </div>
                    {s.kind === 'open' && (
                      <button type="button" onClick={() => setCreating({ stageId: s.id })} title={`Новый лид на этап «${s.name}»`} aria-label="Новый лид на этот этап"
                        className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-primary hover:bg-background inline-flex items-center justify-center"><Plus size={16} /></button>
                    )}
                  </div>
                  <div className="px-2 pb-2 space-y-2 flex-1 overflow-y-auto">
                    {items.map(l => <LeadCard key={l.id} l={l} s={s} />)}
                    {!items.length && <div className="h-12 rounded-lg border border-dashed text-[11px] text-muted-foreground/70 flex items-center justify-center text-center px-2">{quick === 'all' ? 'пусто' : 'нет по фильтру'}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Задачи */
          <div className="grid gap-4 lg:grid-cols-2 pb-24 md:pb-0">
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
                    const tel = telLink(l?.client_phone ?? null), wa = waLink(l?.client_phone ?? null);
                    return (
                      <div key={t.id} className="flex items-center gap-2 pl-3 pr-2 py-2 hover:bg-muted/30">
                        <button type="button" onClick={() => doneTask(t)} aria-label="Выполнено" title="Отметить выполненной"
                          className="h-7 w-7 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-600 hover:bg-emerald-50 shrink-0" />
                        <button type="button" onClick={() => setOpenId(t.lead_id)} className="min-w-0 flex-1 text-left py-0.5">
                          <div className="text-sm font-medium truncate">{t.title} · {l?.client_name ?? 'лид'}</div>
                          <div className={`text-xs ${isOverdue(t) ? 'text-red-600' : 'text-muted-foreground'}`}>{taskKindLabel(t.kind)} · {dueLabel(t.due_at)}{canViewAllManagers && t.manager_id ? ` · ${managerName(t.manager_id)}` : ''}</div>
                        </button>
                        {tel && <a href={tel} className="h-9 w-9 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Позвонить"><Phone size={16} /></a>}
                        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="h-9 w-9 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="WhatsApp"><MessageCircle size={16} /></a>}
                      </div>
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

      {/* Телефон: большая кнопка «новый лид» */}
      <button type="button" onClick={() => setCreating({ stageId: view === 'board' ? mobileStage : undefined })} aria-label="Новый лид"
        className="md:hidden fixed right-4 bottom-14 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform">
        <Plus size={26} />
      </button>

      <LeadSheet leadId={openId} initialTab={openTab} stages={stages} lostReasons={lostReasons} managers={managers} onClose={() => { setOpenId(null); setOpenTab('card'); }} onChanged={onChanged} />
      {isDirector && <WhatsAppSetup open={waOpen} onOpenChange={setWaOpen} managers={managers} />}

      <NewLeadDialog open={!!creating} onOpenChange={v => { if (!v) setCreating(null); }} stages={pipeStages} managers={managers} defaultManager={myId}
        defaultStage={creating?.stageId} canPickManager={canEditAllLeads} pipelineId={pipelineId}
        onOpenExisting={id => { setCreating(null); setOpenId(id); }}
        onCreated={l => { setLeads(prev => [l, ...(prev ?? [])]); getTasks({ open: true }).then(setTasks).catch(() => {}); }} />
    </AppLayout>
  );
}

interface Dup { kind: 'lead' | 'deal'; id: string; name: string; info: string }

function NewLeadDialog({ open, onOpenChange, stages, managers, defaultManager, defaultStage, canPickManager, pipelineId, onCreated, onOpenExisting }: {
  open: boolean; onOpenChange: (v: boolean) => void; stages: CrmStage[]; managers: Manager[]; defaultManager: string | null; defaultStage?: string;
  canPickManager: boolean; pipelineId: string; onCreated: (l: CrmLead) => void; onOpenExisting: (id: string) => void;
}) {
  const [f, setF] = useState({ name: '', phone: '', source: '', amount: '', manager: '', stage: '', comment: '', task: 'call' as TaskKind | '', preset: 1 });
  const [busy, setBusy] = useState(false);
  const [dups, setDups] = useState<Dup[]>([]);
  useEffect(() => {
    if (!open) return;
    const firstOpen = stages.find(s => s.kind === 'open')?.id ?? '';
    setF({ name: '', phone: '', source: '', amount: '', manager: defaultManager ?? '', stage: stages.find(s => s.id === defaultStage && s.kind === 'open')?.id ?? firstOpen, comment: '', task: 'call', preset: 0 });
    setDups([]);
  }, [open, defaultManager, defaultStage, stages]);

  // Такой клиент уже есть? (по последним 10 цифрам телефона)
  const digits = f.phone.replace(/\D/g, '').slice(-10);
  useEffect(() => {
    setDups([]);
    if (digits.length !== 10) return;
    const like = `%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6, 8)}%${digits.slice(8)}%`;
    Promise.all([
      supabase.from('crm_leads').select('id, client_name, stage_id, created_at').ilike('client_phone', like).limit(3),
      supabase.from('deals').select('id, client_name, total_amount, deal_date').ilike('client_phone', like).limit(3),
    ]).then(([a, b]) => {
      const out: Dup[] = [];
      for (const r of (a.data ?? []) as { id: string; client_name: string; stage_id: string }[]) out.push({ kind: 'lead', id: r.id, name: r.client_name, info: stages.find(s => s.id === r.stage_id)?.name ?? 'лид' });
      for (const r of (b.data ?? []) as { id: string; client_name: string; total_amount: number; deal_date: string }[]) out.push({ kind: 'deal', id: r.id, name: r.client_name ?? 'клиент', info: `покупал ${new Date(r.deal_date).toLocaleDateString('ru-RU')} на ${formatCurrency(r.total_amount)}` });
      setDups(out);
    });
  }, [digits, stages]);

  async function save() {
    if (!f.name.trim()) { toast.error('Укажите имя клиента'); return; }
    if (!f.manager) { toast.error('Выберите ответственного'); return; }
    setBusy(true);
    try {
      const l = await createLead({
        pipeline_id: pipelineId, stage_id: f.stage, client_name: f.name.trim(), client_phone: f.phone.trim() ? normPhone(f.phone) : null,
        source: f.source || null, amount: Number(f.amount.replace(/\D/g, '')) || 0, manager_id: f.manager, comment: f.comment.trim() || null,
      });
      if (f.task) {
        await createTask({ lead_id: l.id, manager_id: f.manager, kind: f.task, title: taskKindLabel(f.task), due_at: DUE_PRESETS[f.preset].at() });
      }
      toast.success('Лид создан');
      onOpenChange(false);
      onCreated(l);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось создать'); }
    finally { setBusy(false); }
  }

  const chip = (on: boolean) => `h-9 px-3 rounded-full text-sm border whitespace-nowrap ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Новый лид</DialogTitle><DialogDescription>Обязательно только имя — остальное можно дополнить потом.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); save(); }}>
          <Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Имя клиента" className="h-11" autoComplete="off" autoFocus />
          <Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="Телефон" inputMode="tel" className="h-11" autoComplete="off" />
          {dups.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-1">
              <p className="text-xs font-medium text-amber-800">Этот номер уже есть:</p>
              {dups.map(d => d.kind === 'lead' ? (
                <button key={d.id} type="button" onClick={() => onOpenExisting(d.id)} className="block w-full text-left text-sm text-amber-900 hover:underline">
                  Лид «{d.name}» — {d.info} → открыть
                </button>
              ) : (
                <p key={d.id} className="text-sm text-amber-900">Сделка «{d.name}» — {d.info}</p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {SOURCES.slice(0, 6).map(s => <button key={s} type="button" onClick={() => setF({ ...f, source: f.source === s ? '' : s })} className={chip(f.source === s)}>{s}</button>)}
            <select value={SOURCES.slice(0, 6).includes(f.source) ? '' : f.source} onChange={e => setF({ ...f, source: e.target.value })} className="h-9 rounded-full border border-input bg-background px-3 text-sm">
              <option value="">Ещё…</option>{SOURCES.slice(6).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="Бюджет, ₸" inputMode="numeric" className="h-10" />
            <select value={f.stage} onChange={e => setF({ ...f, stage: e.target.value })} className={field}>
              {stages.filter(s => s.kind === 'open').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {canPickManager && (
            <select value={f.manager} onChange={e => setF({ ...f, manager: e.target.value })} className={field}>
              <option value="">Ответственный</option>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <Input value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} placeholder="Что интересует (необязательно)" className="h-10" />
          <div className="rounded-lg border p-2.5 space-y-2 bg-muted/30">
            <div className="text-xs font-medium text-muted-foreground">Первый шаг</div>
            <div className="flex flex-wrap gap-1.5">
              {TASK_KINDS.slice(0, 4).map(k => <button key={k.id} type="button" onClick={() => setF({ ...f, task: f.task === k.id ? '' : k.id })} className={chip(f.task === k.id)}>{k.label}</button>)}
            </div>
            {f.task && (
              <div className="flex flex-wrap gap-1.5">
                {DUE_PRESETS.map((p, i) => <button key={p.label} type="button" onClick={() => setF({ ...f, preset: i })} className={chip(f.preset === i)}>{p.label}</button>)}
              </div>
            )}
          </div>
          <Button type="submit" className="w-full h-11" disabled={busy}>{busy ? 'Сохраняю…' : 'Создать лид'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
