import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  ArrowLeft, Star, Plus, X, MoreHorizontal, Filter, Archive, Activity, Tag, Palette, Search, RotateCcw, Trash2,
  Columns3, Table2, CalendarDays, GanttChart, BarChart3, Map as MapIcon, Zap, SlidersHorizontal, Eye, Bookmark, LayoutTemplate,
  ChevronsLeftRight, ChevronsRightLeft, Keyboard, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import TableView from '@/components/kanban/views/TableView';
import CalendarView from '@/components/kanban/views/CalendarView';
import TimelineView from '@/components/kanban/views/TimelineView';
import DashboardView from '@/components/kanban/views/DashboardView';
import MapView from '@/components/kanban/views/MapView';
import { AutomationPanel, FieldsPanel, ObserversPanel } from '@/components/kanban/BoardPanels';
import { supabase } from '@/db/supabase';
import { getManagers } from '@/lib/api';
import type { Manager } from '@/types/types';
import {
  getBoard, getBoardContent, updateBoard, createList, updateList, createCard, updateCard, deleteCard,
  getBoardActivity, createLabel, updateLabel, deleteLabel, logActivity, positionBetween,
  BOARD_BACKGROUNDS, BOARD_MATERIALS, isLightBoard, LABEL_COLORS, LIST_COLORS, labelHex, lastOf, runAutomations, copyCard, fieldDisplay,
  getObservers, getSavedFilters, saveFilter, deleteSavedFilter,
  type KBoard, type KList, type KCard, type KLabel, type KActivity, type KCustomField, type KSavedFilter, type KTrigger,
} from '@/lib/kanban';
import { CardTile, Avatar, dueState } from '@/components/kanban/KanbanBits';
import CardDialog from '@/components/kanban/CardDialog';

type DueFilter = 'all' | 'overdue' | 'soon' | 'none' | 'done';
type ViewMode = 'board' | 'table' | 'calendar' | 'timeline' | 'dashboard' | 'map';
const VIEWS: { key: ViewMode; label: string; icon: React.ElementType }[] = [
  { key: 'board', label: 'Доска', icon: Columns3 },
  { key: 'table', label: 'Таблица', icon: Table2 },
  { key: 'calendar', label: 'Календарь', icon: CalendarDays },
  { key: 'timeline', label: 'Таймлайн', icon: GanttChart },
  { key: 'dashboard', label: 'Дашборд', icon: BarChart3 },
  { key: 'map', label: 'Карта', icon: MapIcon },
];

export default function BoardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const openCardId = searchParams.get('card');

  const [board, setBoard] = useState<KBoard | null>(null);
  const [lists, setLists] = useState<KList[]>([]);
  const [cards, setCards] = useState<KCard[]>([]);
  const [labels, setLabels] = useState<KLabel[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [fields, setFields] = useState<KCustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isDirector } = useAuth();
  const [readOnly, setReadOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [savedFilters, setSavedFilters] = useState<KSavedFilter[]>([]);
  const viewKey = `afin-board-view-${id}`;
  const [view, setViewState] = useState<ViewMode>(() => { try { return (localStorage.getItem(viewKey) as ViewMode) || 'board'; } catch { return 'board'; } });
  const setView = (v: ViewMode) => { setViewState(v); try { localStorage.setItem(viewKey, v); } catch { /* ignore */ } };

  // фильтры
  const [q, setQ] = useState('');
  const [fLabels, setFLabels] = useState<string[]>([]);
  const [fMembers, setFMembers] = useState<string[]>([]);
  const [fDue, setFDue] = useState<DueFilter>('all');

  // перетаскивание
  const dragCard = useRef<string | null>(null);
  const dragList = useRef<string | null>(null);
  const [dropHint, setDropHint] = useState<{ listId: string; index: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // добавление
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  // меню доски
  const [menuOpen, setMenuOpen] = useState<null | 'activity' | 'archive' | 'labels' | 'automation' | 'fields' | 'observers'>(null);
  const [activity, setActivity] = useState<KActivity[]>([]);

  const load = useCallback(async () => {
    try {
      const [b, content] = await Promise.all([getBoard(id), getBoardContent(id)]);
      if (!b) { toast.error('Доска не найдена'); navigate('/boards'); return; }
      setBoard(b); setLists(content.lists); setCards(content.cards); setLabels(content.labels); setFields(content.fields);
    } catch { toast.error('Не удалось загрузить доску'); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { load(); getManagers().then(m => setManagers(m.filter(x => x.is_active))).catch(() => {}); }, [load]);
  useEffect(() => {
    getSavedFilters(id).then(setSavedFilters).catch(() => {});
    if (user && !isDirector) getObservers(id).then(o => setReadOnly(o.includes(user.id))).catch(() => {});
  }, [id, user, isDirector]);

  // Горячие клавиши: / — поиск, N — новая карточка, 1–6 — вид
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || searchParams.get('card')) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      if ((e.key === 'n' || e.key === 'т' || e.key === 'N') && !readOnly) {
        const first = lists.filter(l => !l.archived && !l.collapsed).sort((a, b) => a.position - b.position)[0];
        if (first) { e.preventDefault(); setView('board'); setAddingIn(first.id); setNewCardTitle(''); }
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= VIEWS.length) setView(VIEWS[n - 1].key);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Запуск правил автоматизации после действия; если что-то сработало — обновляем доску
  async function automate(event: KTrigger, cardId: string) {
    const n = await runAutomations(id, event, cardId);
    if (n > 0) { toast.message(`Автоматизация: сработало правил — ${n}`); load(); }
  }

  // Живое обновление: изменения других сотрудников подтягиваются сами
  const reloadTimer = useRef<number | null>(null);
  useEffect(() => {
    const schedule = () => {
      if (dragCard.current || dragList.current) return;
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => { load(); }, 400);
    };
    const ch = supabase.channel(`kanban-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_cards', filter: `board_id=eq.${id}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_lists', filter: `board_id=eq.${id}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_card_labels' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_card_members' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_checklist_items' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_comments' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_card_field_values' }, schedule)
      .subscribe();
    return () => { supabase.removeChannel(ch); if (reloadTimer.current) window.clearTimeout(reloadTimer.current); };
  }, [id, load]);

  const activeLists = useMemo(() => lists.filter(l => !l.archived).sort((a, b) => a.position - b.position), [lists]);
  const filtering = q.trim() !== '' || fLabels.length > 0 || fMembers.length > 0 || fDue !== 'all';
  const matches = useCallback((c: KCard) => {
    if (q.trim() && !(`${c.title} ${c.description ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))) return false;
    if (fLabels.length && !fLabels.some(l => c.label_ids.includes(l))) return false;
    if (fMembers.length && !fMembers.some(m => c.member_ids.includes(m))) return false;
    if (fDue !== 'all') {
      const s = dueState(c);
      if (fDue === 'none' && s !== null) return false;
      if (fDue === 'overdue' && s !== 'overdue') return false;
      if (fDue === 'soon' && s !== 'soon') return false;
      if (fDue === 'done' && s !== 'done') return false;
    }
    return true;
  }, [q, fLabels, fMembers, fDue]);
  const cardsOf = useCallback((listId: string) =>
    cards.filter(c => c.list_id === listId && !c.archived).sort((a, b) => a.position - b.position), [cards]);
  const templates = useMemo(() => cards.filter(c => c.is_template && !c.archived), [cards]);
  // Для видов (таблица, календарь…) — рабочие карточки без шаблонов, с учётом фильтра
  const viewCards = useMemo(() => {
    const listIds = new Set(lists.filter(l => !l.archived).map(l => l.id));
    return cards.filter(c => !c.archived && !c.is_template && listIds.has(c.list_id) && (!filtering || matches(c)));
  }, [cards, lists, filtering, matches]);

  // ── Карточки: перетаскивание ──
  function onCardDragOver(e: React.DragEvent, listId: string, index: number) {
    if (!dragCard.current) return;
    e.preventDefault(); e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const next = { listId, index: after ? index + 1 : index };
    if (!dropHint || dropHint.listId !== next.listId || dropHint.index !== next.index) setDropHint(next);
  }
  function onListBodyDragOver(e: React.DragEvent, listId: string) {
    if (!dragCard.current) return;
    e.preventDefault();
    const count = cardsOf(listId).length;
    if (!dropHint || dropHint.listId !== listId) setDropHint({ listId, index: count });
  }
  async function onCardDrop(e: React.DragEvent) {
    e.preventDefault();
    const cardId = dragCard.current;
    const hint = dropHint;
    dragCard.current = null; setDraggingId(null); setDropHint(null);
    if (!cardId || !hint) return;
    const moving = cards.find(c => c.id === cardId);
    if (!moving) return;
    const target = cardsOf(hint.listId).filter(c => c.id !== cardId);
    // индекс без самой карточки (если двигаем внутри той же колонки ниже себя)
    const original = cardsOf(hint.listId).findIndex(c => c.id === cardId);
    const idx = original >= 0 && original < hint.index ? hint.index - 1 : hint.index;
    const pos = positionBetween(target[idx - 1]?.position, target[idx]?.position);
    if (moving.list_id === hint.listId && Math.abs(moving.position - pos) < 1e-9) return;
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, list_id: hint.listId, position: pos } : c));
    try {
      await updateCard(cardId, { list_id: hint.listId, position: pos });
      if (moving.list_id !== hint.listId) {
        const from = lists.find(l => l.id === moving.list_id)?.title;
        const to = lists.find(l => l.id === hint.listId)?.title;
        logActivity(id, `переместил(а) «${moving.title}»: ${from} → ${to}`, cardId);
        automate({ type: 'moved_to_list', list_id: hint.listId }, cardId);
      }
    } catch { toast.error('Не удалось переместить'); load(); }
  }

  // ── Колонки: перетаскивание ──
  async function onListDrop(targetListId: string) {
    const listId = dragList.current;
    dragList.current = null;
    if (!listId || listId === targetListId) return;
    const others = activeLists.filter(l => l.id !== listId);
    const ti = others.findIndex(l => l.id === targetListId);
    const fromIdx = activeLists.findIndex(l => l.id === listId);
    const toIdx = activeLists.findIndex(l => l.id === targetListId);
    // вправо — ставим после целевой, влево — перед ней
    const pos = toIdx > fromIdx
      ? positionBetween(others[ti]?.position, others[ti + 1]?.position)
      : positionBetween(others[ti - 1]?.position, others[ti]?.position);
    setLists(prev => prev.map(l => l.id === listId ? { ...l, position: pos } : l));
    await updateList(listId, { position: pos }).catch(() => { toast.error('Не удалось переместить колонку'); load(); });
  }

  // ── Добавление ──
  async function addCard(listId: string) {
    const title = newCardTitle.trim();
    if (!title) { setAddingIn(null); return; }
    const tail = lastOf(cardsOf(listId));
    setNewCardTitle('');
    try {
      const newId = await createCard(id, listId, title, positionBetween(tail?.position, undefined));
      await load();
      if (newId) automate({ type: 'card_created', list_id: listId }, newId);
    }
    catch { toast.error('Не удалось добавить карточку'); }
  }
  async function addFromTemplate(listId: string, t: KCard) {
    const tail = lastOf(cardsOf(listId));
    try {
      const newId = await copyCard(t, listId, positionBetween(tail?.position, undefined), t.title);
      logActivity(id, `создал(а) карточку из шаблона «${t.title}»`, newId);
      await load();
      setSearchParams({ card: newId });
      automate({ type: 'card_created', list_id: listId }, newId);
    } catch { toast.error('Не удалось создать из шаблона'); }
  }
  async function addList() {
    const title = newListTitle.trim();
    if (!title) { setAddingList(false); return; }
    setNewListTitle('');
    try { await createList(id, title, positionBetween(lastOf(activeLists)?.position, undefined)); await load(); }
    catch { toast.error('Не удалось добавить колонку'); }
  }
  async function renameList(l: KList, title: string) {
    setEditingListId(null);
    if (!title.trim() || title.trim() === l.title) return;
    setLists(prev => prev.map(x => x.id === l.id ? { ...x, title: title.trim() } : x));
    await updateList(l.id, { title: title.trim() }).catch(() => load());
  }
  async function archiveList(l: KList) {
    await updateList(l.id, { archived: true });
    logActivity(id, `архивировал(а) колонку «${l.title}»`);
    load();
  }
  async function archiveAllCards(l: KList) {
    const list = cardsOf(l.id);
    if (!list.length || !window.confirm(`Отправить в архив все ${list.length} карточек из «${l.title}»?`)) return;
    await Promise.all(list.map(c => updateCard(c.id, { archived: true })));
    logActivity(id, `архивировал(а) все карточки в «${l.title}»`);
    load();
  }
  async function sortList(l: KList, by: 'due' | 'created' | 'title') {
    const list = [...cardsOf(l.id)];
    list.sort((a, b) => by === 'due'
      ? (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999')
      : by === 'created' ? a.created_at.localeCompare(b.created_at) : a.title.localeCompare(b.title, 'ru'));
    await Promise.all(list.map((c, i) => updateCard(c.id, { position: (i + 1) * 1024 })));
    load();
  }

  async function openMenu(kind: 'activity' | 'archive' | 'labels' | 'automation' | 'fields' | 'observers') {
    setMenuOpen(kind);
    if (kind === 'activity') setActivity(await getBoardActivity(id));
  }

  if (loading || !board) {
    return <AppLayout><div className="text-sm text-muted-foreground">Загрузка доски…</div></AppLayout>;
  }

  const bg = BOARD_BACKGROUNDS[board.background] ?? BOARD_BACKGROUNDS.emerald;
  const light = isLightBoard(board.background);
  const ink = light ? 'text-[#22272b]' : 'text-white';
  const hov = light ? 'hover:bg-black/10' : 'hover:bg-white/20';
  const overdueCount = viewCards.filter(c => dueState(c) === 'overdue').length;
  const soonCount = viewCards.filter(c => dueState(c) === 'soon').length;
  const toggleMember = (mid: string) => setFMembers(p => p.includes(mid) ? p.filter(x => x !== mid) : [...p, mid]);
  async function quickToggleDue(c: KCard) {
    setCards(p => p.map(x => x.id === c.id ? { ...x, due_done: !c.due_done } : x));
    await updateCard(c.id, { due_done: !c.due_done }).catch(() => load());
    if (!c.due_done) { logActivity(id, `отметил(а) «${c.title}» выполненной`, c.id); automate({ type: 'due_done' }, c.id); }
  }
  async function quickArchive(c: KCard) {
    setCards(p => p.map(x => x.id === c.id ? { ...x, archived: true } : x));
    await updateCard(c.id, { archived: true }).catch(() => load());
    logActivity(id, `архивировал(а) «${c.title}»`, c.id);
    toast('Карточка в архиве', { action: { label: 'Вернуть', onClick: async () => { await updateCard(c.id, { archived: false }); load(); } } });
  }
  const archivedCards = cards.filter(c => c.archived);
  const archivedLists = lists.filter(l => l.archived);

  return (
    <AppLayout>
      <div className="-m-4 md:-m-6 flex flex-col h-[calc(100dvh-104px)] lg:h-[calc(100dvh-48px)]" style={{ background: bg }}>
        {/* Шапка доски */}
        <div className={`flex items-center gap-2 px-3 md:px-4 py-2.5 backdrop-blur-sm flex-wrap ${light ? "bg-white/45" : "bg-black/25"} ${ink}`}>
          <Button size="icon" variant="ghost" className={`h-8 w-8 ${ink} ${hov}`} onClick={() => navigate('/boards')} aria-label="Все доски">
            <ArrowLeft size={16} />
          </Button>
          {editingTitle ? (
            <Input autoFocus defaultValue={board.title} className="h-8 w-56 bg-white text-foreground"
              onBlur={async e => { setEditingTitle(false); const t = e.target.value.trim(); if (t && t !== board.title) { setBoard({ ...board, title: t }); await updateBoard(id, { title: t }); } }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingTitle(false); }} />
          ) : (
            <button type="button" className={`font-display text-xl font-bold tracking-tight px-2 py-0.5 rounded ${hov}`} onClick={() => setEditingTitle(true)}>{board.title}</button>
          )}
          <Button size="icon" variant="ghost" className={`h-8 w-8 ${ink} ${hov}`} aria-label="Избранное"
            onClick={async () => { setBoard({ ...board, starred: !board.starred }); await updateBoard(id, { starred: !board.starred }); }}>
            <Star size={16} className={board.starred ? 'fill-yellow-300 text-yellow-300' : ''} />
          </Button>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-300 text-amber-950 font-medium">в разработке</span>
          {readOnly && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/25 font-medium inline-flex items-center gap-1"><Eye size={11} />только просмотр</span>}
          <span className={`hidden sm:inline text-xs ${light ? 'text-black/55' : 'text-white/75'}`}>{viewCards.length} карточек</span>
          {overdueCount > 0 && (
            <button type="button" onClick={() => setFDue(fDue === 'overdue' ? 'all' : 'overdue')} title="Показать только просроченные"
              className={`text-xs rounded-full px-2 py-0.5 inline-flex items-center gap-1 font-medium ${fDue === 'overdue' ? 'bg-white text-red-700' : 'bg-red-600 text-white'}`}>
              <AlertTriangle size={11} />просрочено {overdueCount}
            </button>
          )}
          {soonCount > 0 && (
            <button type="button" onClick={() => setFDue(fDue === 'soon' ? 'all' : 'soon')} title="Срок в ближайшие сутки"
              className={`text-xs rounded-full px-2 py-0.5 font-medium ${fDue === 'soon' ? 'bg-white text-amber-800' : 'bg-amber-400 text-amber-950'}`}>
              скоро срок {soonCount}
            </button>
          )}

          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <div className="relative">
              <Search size={13} className={`absolute left-2 top-1/2 -translate-y-1/2 ${light ? "text-black/50" : "text-white/70"}`} />
              <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск   /"
                className={`h-8 w-40 md:w-52 rounded-md text-sm pl-7 pr-2 outline-none focus:bg-white focus:text-foreground focus:placeholder:text-muted-foreground ${light ? 'bg-white/70 placeholder:text-black/45 text-foreground' : 'bg-white/20 placeholder:text-white/70 text-white'}`} />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className={`h-8 ${ink} ${hov} ${filtering ? (light ? 'bg-black/10' : 'bg-white/25') : ''}`}>
                  <Filter size={14} className="mr-1" />Фильтр{filtering ? ' •' : ''}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">Метки</div>
                  {labels.map(l => (
                    <label key={l.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={fLabels.includes(l.id)} onChange={e => setFLabels(p => e.target.checked ? [...p, l.id] : p.filter(x => x !== l.id))} />
                      <span className="h-4 flex-1 rounded px-1.5 text-[11px] font-semibold text-black/75" style={{ background: labelHex(l.color) }}>{l.name}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">Участники</div>
                  {managers.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={fMembers.includes(m.id)} onChange={e => setFMembers(p => e.target.checked ? [...p, m.id] : p.filter(x => x !== m.id))} />
                      <Avatar m={m} size={20} />{m.name}
                    </label>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">Срок</div>
                  <div className="flex flex-wrap gap-1">
                    {([['all', 'Любой'], ['overdue', 'Просрочен'], ['soon', 'В ближайшие 24 ч'], ['done', 'Выполнен'], ['none', 'Без срока']] as [DueFilter, string][]).map(([k, t]) => (
                      <button key={k} type="button" onClick={() => setFDue(k)}
                        className={`text-xs rounded-full px-2.5 py-1 border ${fDue === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>{t}</button>
                    ))}
                  </div>
                </div>
                {filtering && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setQ(''); setFLabels([]); setFMembers([]); setFDue('all'); }}>Сбросить</Button>
                    <Button size="sm" variant="secondary" className="flex-1" onClick={async () => {
                      const name = window.prompt('Название фильтра, например «Мои просроченные»');
                      if (!name?.trim()) return;
                      await saveFilter(id, name.trim(), { q, labels: fLabels, members: fMembers, due: fDue });
                      setSavedFilters(await getSavedFilters(id));
                    }}><Bookmark size={12} className="mr-1" />Сохранить</Button>
                  </div>
                )}
                {savedFilters.length > 0 && (
                  <div className="space-y-1 border-t border-border pt-2">
                    <div className="text-xs font-semibold text-muted-foreground">Сохранённые фильтры</div>
                    {savedFilters.map(sf => (
                      <div key={sf.id} className="flex items-center gap-1">
                        <button type="button" className="flex-1 text-left text-sm rounded px-2 py-1 hover:bg-muted truncate"
                          onClick={() => { setQ(sf.filter.q ?? ''); setFLabels(sf.filter.labels ?? []); setFMembers(sf.filter.members ?? []); setFDue((sf.filter.due as DueFilter) ?? 'all'); }}>
                          <Bookmark size={12} className="inline mr-1.5" />{sf.name}
                        </button>
                        <button type="button" aria-label="Удалить фильтр" className="text-muted-foreground hover:text-destructive"
                          onClick={async () => { await deleteSavedFilter(sf.id); setSavedFilters(p => p.filter(x => x.id !== sf.id)); }}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <div className="hidden md:flex -space-x-1.5 mx-1">
              {managers.slice(0, 6).map(m => (
                <button key={m.id} type="button" onClick={() => toggleMember(m.id)} title={`${m.name}: показать только его карточки`}
                  className={`rounded-full transition-transform hover:-translate-y-0.5 ${fMembers.includes(m.id) ? 'ring-2 ring-offset-1 ring-amber-300 z-10' : fMembers.length ? 'opacity-50' : ''}`}>
                  <Avatar m={m} size={28} />
                </button>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className={`hidden md:inline-flex h-8 w-8 ${ink} ${hov}`} aria-label="Горячие клавиши"><Keyboard size={16} /></Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 text-sm space-y-1.5">
                <div className="font-semibold mb-1">Горячие клавиши</div>
                {[['/', 'поиск карточек'], ['N', 'новая карточка в первой колонке'], ['1–6', 'переключить вид'], ['Esc', 'закрыть карточку'], ['Двойной клик', 'по пустому месту — новая колонка']].map(([k, t]) => (
                  <div key={k} className="flex items-center gap-2"><kbd className="min-w-[28px] text-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-sans">{k}</kbd><span className="text-muted-foreground">{t}</span></div>
                ))}
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className={`h-8 w-8 ${ink} ${hov}`} aria-label="Меню доски"><MoreHorizontal size={16} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => openMenu('automation')}><Zap size={14} className="mr-2" />Автоматизация</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openMenu('fields')}><SlidersHorizontal size={14} className="mr-2" />Свои поля</DropdownMenuItem>
                {isDirector && <DropdownMenuItem onClick={() => openMenu('observers')}><Eye size={14} className="mr-2" />Наблюдатели</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openMenu('activity')}><Activity size={14} className="mr-2" />История действий</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openMenu('labels')}><Tag size={14} className="mr-2" />Метки</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openMenu('archive')}><Archive size={14} className="mr-2" />Архив ({archivedCards.length + archivedLists.length})</DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Palette size={12} />Фон доски</div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {BOARD_MATERIALS.map(m => (
                      <button key={m.key} type="button" aria-label={m.name} title={m.name} onClick={async () => { setBoard({ ...board, background: m.key }); await updateBoard(id, { background: m.key }); }}
                        className={`h-7 rounded ${board.background === m.key ? 'ring-2 ring-offset-1 ring-primary' : ''}`} style={{ background: m.css }} />
                    ))}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={async () => {
                  if (!window.confirm('Отправить доску в архив? Её можно будет вернуть на странице «Доски».')) return;
                  await updateBoard(id, { archived: true }); navigate('/boards');
                }}><Archive size={14} className="mr-2" />Архивировать доску</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Виды доски */}
        <div className={`flex items-center gap-1 px-3 md:px-4 py-1.5 overflow-x-auto ${light ? "bg-white/25" : "bg-black/10"}`}>
          {VIEWS.map(v => (
            <button key={v.key} type="button" onClick={() => setView(v.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors ${view === v.key ? 'bg-white text-foreground font-medium shadow-sm' : `${light ? 'text-black/70' : 'text-white/90'} ${hov}`}`}>
              <v.icon size={14} />{v.label}
            </button>
          ))}
          {filtering && view !== 'board' && <span className={`ml-2 text-xs shrink-0 ${light ? 'text-black/60' : 'text-white/90'}`}>фильтр включён, показано {viewCards.length}</span>}
        </div>

        {view === 'table' && <div className="flex-1 min-h-0"><TableView boardTitle={board.title} lists={activeLists} cards={viewCards} labels={labels} managers={managers} fields={fields} onOpen={cid => setSearchParams({ card: cid })} /></div>}
        {view === 'calendar' && <div className="flex-1 min-h-0 overflow-auto"><CalendarView lists={activeLists} cards={viewCards} readOnly={readOnly} onOpen={cid => setSearchParams({ card: cid })}
          onMove={async (cid, due) => { setCards(p => p.map(c => c.id === cid ? { ...c, due_at: due } : c)); await updateCard(cid, { due_at: due }).catch(() => load()); logActivity(id, 'перенёс(ла) срок в календаре', cid); }} /></div>}
        {view === 'timeline' && <div className="flex-1 min-h-0"><TimelineView lists={activeLists} cards={viewCards} readOnly={readOnly} onOpen={cid => setSearchParams({ card: cid })}
          onShift={async (cid, start, due) => { setCards(p => p.map(c => c.id === cid ? { ...c, start_at: start, due_at: due } : c)); await updateCard(cid, { start_at: start, due_at: due }).catch(() => load()); logActivity(id, 'сдвинул(а) даты на таймлайне', cid); }} /></div>}
        {view === 'dashboard' && <div className="flex-1 min-h-0"><DashboardView lists={activeLists} cards={viewCards} labels={labels} managers={managers} /></div>}
        {view === 'map' && <div className="flex-1 min-h-0"><MapView boardId={id} lists={activeLists} cards={viewCards} readOnly={readOnly} onOpen={cid => setSearchParams({ card: cid })} onChanged={load} /></div>}

        {/* Колонки */}
        {view === 'board' && <div className="flex-1 overflow-x-auto overflow-y-hidden kanban-scroll snap-x snap-mandatory sm:snap-none"
          onDoubleClick={e => { if (!readOnly && e.target === e.currentTarget.firstElementChild) setAddingList(true); }}>
          <div className="flex items-start gap-3 p-3 md:p-4 h-full">
            {activeLists.length === 0 && !readOnly && (
              <div className="shrink-0 w-[min(420px,85vw)] rounded-2xl bg-white/90 backdrop-blur p-5 space-y-3 shadow-sm">
                <div className="font-display text-lg font-bold">Доска пустая</div>
                <p className="text-sm text-muted-foreground">Колонки — это этапы работы. Добавьте свою или возьмите готовый набор для производства дверей.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setAddingList(true)}><Plus size={14} className="mr-1" />Своя колонка</Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    const titles = ['Продано', 'Замер', 'Заказ поставщику', 'В производстве', 'Склад', 'Монтаж', 'Завершено'];
                    for (let i = 0; i < titles.length; i++) await createList(id, titles[i], (i + 1) * 1024);
                    load();
                  }}>Этапы производства дверей</Button>
                </div>
              </div>
            )}
            {activeLists.map(list => {
              const all = cardsOf(list.id);
              const visible = filtering ? all.filter(matches) : all;
              if (list.collapsed) {
                return (
                  <button key={list.id} type="button" title="Развернуть колонку"
                    onClick={async () => { setLists(p => p.map(x => x.id === list.id ? { ...x, collapsed: false } : x)); await updateList(list.id, { collapsed: false }); }}
                    onDragOver={e => { if (dragCard.current) { e.preventDefault(); onListBodyDragOver(e, list.id); } }}
                    onDrop={e => onCardDrop(e)}
                    className="shrink-0 w-10 max-h-full rounded-xl bg-[#f4f5f6]/95 dark:bg-zinc-800 shadow-sm flex flex-col items-center gap-2 py-3 hover:brightness-95 snap-start"
                    style={list.color ? { borderTop: `4px solid ${labelHex(list.color)}` } : undefined}>
                    <ChevronsLeftRight size={14} className="text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">{all.length}</span>
                    <span className="text-sm font-semibold [writing-mode:vertical-rl] rotate-180 truncate max-h-[60vh]">{list.title}</span>
                  </button>
                );
              }
              return (
                <div key={list.id}
                  className={`shrink-0 w-[85vw] sm:w-[280px] snap-start max-h-full flex flex-col rounded-xl bg-[#f4f5f6]/95 dark:bg-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,.12),0_8px_24px_-12px_rgba(0,0,0,.35)] overflow-hidden transition-shadow
                    ${draggingId && dropHint?.listId === list.id ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-transparent' : ''}`}
                  style={list.color ? { background: `color-mix(in srgb, ${labelHex(list.color)} 13%, #f4f5f6)` } : undefined}
                  onDragOver={e => { if (dragList.current) e.preventDefault(); else onListBodyDragOver(e, list.id); }}
                  onDrop={e => { if (dragList.current) { e.preventDefault(); onListDrop(list.id); } else onCardDrop(e); }}>
                  {/* алюминиевая кромка сверху — как у наших дверей; у цветной колонки — её цвет */}
                  <div className="h-[4px] shrink-0" style={{ background: list.color ? labelHex(list.color) : 'linear-gradient(90deg, #aab1b8 0%, #eef1f3 35%, #b7bec5 60%, #e2e6e9 85%, #9ea6ad 100%)' }} />
                  {/* заголовок колонки — за него можно перетаскивать колонку */}
                  <div className="flex items-center gap-1 px-2 pt-2 pb-1 cursor-grab active:cursor-grabbing"
                    draggable={!readOnly && editingListId !== list.id}
                    onDragStart={e => { dragList.current = list.id; e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { dragList.current = null; }}>
                    {editingListId === list.id ? (
                      <Input autoFocus defaultValue={list.title} className="h-7 text-sm font-semibold"
                        onBlur={e => renameList(list, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingListId(null); }} />
                    ) : (
                      <button type="button" className="flex-1 text-left text-sm font-semibold px-1.5 py-1 rounded hover:bg-black/5 truncate" onClick={() => { if (!readOnly) setEditingListId(list.id); }}>
                        {list.title}
                      </button>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums rounded-full bg-black/5 px-1.5 py-0.5">{filtering ? `${visible.length}/${all.length}` : all.length}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Меню колонки"><MoreHorizontal size={14} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem disabled={readOnly} onClick={() => { setAddingIn(list.id); setNewCardTitle(''); }}><Plus size={14} className="mr-2" />Добавить карточку</DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => { setLists(p => p.map(x => x.id === list.id ? { ...x, collapsed: true } : x)); await updateList(list.id, { collapsed: true }); }}>
                          <ChevronsRightLeft size={14} className="mr-2" />Свернуть колонку
                        </DropdownMenuItem>
                        {!readOnly && (
                          <div className="px-2 py-1.5">
                            <div className="text-xs text-muted-foreground mb-1.5">Цвет колонки</div>
                            <div className="grid grid-cols-6 gap-1">
                              {LIST_COLORS.map(c => (
                                <button key={c} type="button" aria-label={c} onClick={async () => { setLists(p => p.map(x => x.id === list.id ? { ...x, color: c } : x)); await updateList(list.id, { color: c }); }}
                                  className={`h-6 rounded ${list.color === c ? 'ring-2 ring-offset-1 ring-primary' : ''}`} style={{ background: labelHex(c) }} />
                              ))}
                              <button type="button" aria-label="Без цвета" onClick={async () => { setLists(p => p.map(x => x.id === list.id ? { ...x, color: null } : x)); await updateList(list.id, { color: null }); }}
                                className="h-6 rounded border border-border text-[10px]">✕</button>
                            </div>
                          </div>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => sortList(list, 'due')}>Сортировать по сроку</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => sortList(list, 'created')}>Сортировать по дате создания</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => sortList(list, 'title')}>Сортировать по названию</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => archiveAllCards(list)}>Архивировать все карточки</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => archiveList(list)}>Архивировать колонку</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* карточки */}
                  <div className="flex-1 min-h-[8px] overflow-y-auto px-2 pb-1 space-y-2">
                    {visible.map((c, i) => (
                      <React.Fragment key={c.id}>
                        {dropHint?.listId === list.id && dropHint.index === i && draggingId && <div className="h-1.5 rounded bg-primary/60" />}
                        <div draggable={!readOnly}
                          onDragStart={e => { dragCard.current = c.id; setDraggingId(c.id); e.dataTransfer.effectAllowed = 'move'; }}
                          onDragEnd={() => { dragCard.current = null; setDraggingId(null); setDropHint(null); }}
                          onDragOver={e => onCardDragOver(e, list.id, i)}>
                          <CardTile card={c} labels={labels} members={managers} fields={fields} dragging={draggingId === c.id}
                            onOpen={() => setSearchParams({ card: c.id })}
                            onToggleDue={readOnly ? undefined : () => quickToggleDue(c)}
                            onArchive={readOnly ? undefined : () => quickArchive(c)}
                            onToggleMemberFilter={toggleMember} />
                        </div>
                      </React.Fragment>
                    ))}
                    {dropHint?.listId === list.id && dropHint.index >= visible.length && draggingId && <div className="h-1.5 rounded bg-primary/60" />}
                    {addingIn === list.id && (
                      <div className="space-y-1.5">
                        <Textarea autoFocus rows={2} value={newCardTitle} placeholder="Введите название карточки"
                          className="bg-card text-sm resize-none"
                          onChange={e => setNewCardTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCard(list.id); } if (e.key === 'Escape') setAddingIn(null); }} />
                        <div className="flex items-center gap-1">
                          <Button size="sm" className="h-8" onClick={() => addCard(list.id)}>Добавить карточку</Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAddingIn(null)}><X size={16} /></Button>
                          {templates.length > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 ml-auto" aria-label="Из шаблона" title="Создать из шаблона"><LayoutTemplate size={15} /></Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-60 p-2 space-y-1" align="end">
                                <div className="text-xs font-semibold text-muted-foreground px-1 pb-1">Создать из шаблона</div>
                                {templates.map(t => (
                                  <button key={t.id} type="button" className="w-full text-left rounded px-2 py-1.5 text-sm hover:bg-muted truncate"
                                    onClick={() => { setAddingIn(null); addFromTemplate(list.id, t); }}>{t.title}</button>
                                ))}
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {addingIn !== list.id && !readOnly && (
                    <button type="button" onClick={() => { setAddingIn(list.id); setNewCardTitle(''); }}
                      className="m-2 mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-black/5 text-left">
                      <Plus size={15} />Добавить карточку
                    </button>
                  )}
                </div>
              );
            })}

            {/* новая колонка */}
            {!readOnly && <div className="shrink-0 w-[85vw] sm:w-[280px] snap-start">
              {addingList ? (
                <div className="rounded-xl bg-[#f4f5f6] dark:bg-zinc-800 p-2 space-y-1.5">
                  <Input autoFocus value={newListTitle} placeholder="Название колонки" onChange={e => setNewListTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') setAddingList(false); }} />
                  <div className="flex items-center gap-1">
                    <Button size="sm" className="h-8" onClick={addList}>Добавить колонку</Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAddingList(false)}><X size={16} /></Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingList(true)}
                  className={`w-full flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${light ? 'bg-black/10 hover:bg-black/15 text-[#22272b]' : 'bg-white/25 hover:bg-white/35 text-white'}`}>
                  <Plus size={15} />Добавить ещё одну колонку
                </button>
              )}
            </div>}
          </div>
        </div>}
      </div>

      {/* Карточка */}
      {openCardId && cards.find(c => c.id === openCardId) && (
        <CardDialog
          card={cards.find(c => c.id === openCardId)!}
          board={board}
          lists={activeLists}
          labels={labels}
          managers={managers}
          cardsOfList={cardsOf}
          onLabelsChanged={setLabels}
          fields={fields}
          readOnly={readOnly}
          onAutomation={automate}
          onClose={() => setSearchParams({})}
          onChanged={load}
        />
      )}

      {/* Боковое меню: история, архив, метки */}
      <Sheet open={menuOpen !== null} onOpenChange={o => { if (!o) setMenuOpen(null); }}>
        <SheetContent className="w-[360px] sm:w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{({ activity: 'История действий', archive: 'Архив', labels: 'Метки доски', automation: 'Автоматизация', fields: 'Свои поля', observers: 'Наблюдатели' } as Record<string, string>)[menuOpen ?? 'activity']}</SheetTitle>
          </SheetHeader>
          {menuOpen === 'activity' && (
            <div className="mt-4 space-y-3">
              {activity.length === 0 && <p className="text-sm text-muted-foreground">Пока пусто</p>}
              {activity.map(a => (
                <div key={a.id} className="text-sm">
                  <span className="font-medium">{a.actor_name ?? 'Кто-то'}</span> {a.action}
                  <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              ))}
            </div>
          )}
          {menuOpen === 'archive' && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Карточки</div>
                {archivedCards.length === 0 && <p className="text-sm text-muted-foreground">Нет карточек в архиве</p>}
                {archivedCards.map(c => (
                  <div key={c.id} className="rounded-lg border border-border p-2 space-y-1.5">
                    <div className="text-sm">{c.title}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => { await updateCard(c.id, { archived: false }); load(); }}><RotateCcw size={12} className="mr-1" />Вернуть</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={async () => {
                        if (!window.confirm(`Удалить карточку «${c.title}» навсегда?`)) return;
                        await deleteCard(c.id); load();
                      }}><Trash2 size={12} className="mr-1" />Удалить</Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Колонки</div>
                {archivedLists.length === 0 && <p className="text-sm text-muted-foreground">Нет колонок в архиве</p>}
                {archivedLists.map(l => (
                  <div key={l.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                    {l.title}
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => { await updateList(l.id, { archived: false }); load(); }}><RotateCcw size={12} className="mr-1" />Вернуть</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {menuOpen === 'automation' && <AutomationPanel boardId={id} lists={activeLists} labels={labels} managers={managers} />}
          {menuOpen === 'fields' && <FieldsPanel boardId={id} fields={fields} onChange={load} />}
          {menuOpen === 'observers' && <ObserversPanel boardId={id} />}
          {menuOpen === 'labels' && (
            <LabelsEditor boardId={id} labels={labels} onChange={setLabels} />
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

function LabelsEditor({ boardId, labels, onChange }: { boardId: string; labels: KLabel[]; onChange: (l: KLabel[]) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('green');
  return (
    <div className="mt-4 space-y-3">
      {labels.map(l => (
        <div key={l.id} className="flex items-center gap-2">
          <input className="flex-1 h-8 rounded px-2 text-sm font-semibold text-black/80 outline-none" style={{ background: labelHex(l.color) }}
            defaultValue={l.name}
            onBlur={async e => { if (e.target.value !== l.name) { await updateLabel(l.id, { name: e.target.value }); onChange(labels.map(x => x.id === l.id ? { ...x, name: e.target.value } : x)); } }} />
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Удалить метку"
            onClick={async () => { if (!window.confirm(`Удалить метку «${l.name}» со всех карточек?`)) return; await deleteLabel(l.id); onChange(labels.filter(x => x.id !== l.id)); }}>
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      <div className="rounded-lg border border-border p-2 space-y-2">
        <Input value={name} placeholder="Новая метка" onChange={e => setName(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {LABEL_COLORS.map(c => (
            <button key={c.key} type="button" title={c.name} onClick={() => setColor(c.key)}
              className={`h-7 w-10 rounded ${color === c.key ? 'ring-2 ring-offset-1 ring-primary' : ''}`} style={{ background: c.hex }} />
          ))}
        </div>
        <Button size="sm" className="w-full" onClick={async () => {
          const l = await createLabel(boardId, name.trim(), color); onChange([...labels, l]); setName('');
        }}>Создать метку</Button>
      </div>
    </div>
  );
}
