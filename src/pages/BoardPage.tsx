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
} from 'lucide-react';
import { supabase } from '@/db/supabase';
import { getManagers } from '@/lib/api';
import type { Manager } from '@/types/types';
import {
  getBoard, getBoardContent, updateBoard, createList, updateList, createCard, updateCard, deleteCard,
  getBoardActivity, createLabel, updateLabel, deleteLabel, logActivity, positionBetween,
  BOARD_BACKGROUNDS, LABEL_COLORS, labelHex, lastOf,
  type KBoard, type KList, type KCard, type KLabel, type KActivity,
} from '@/lib/kanban';
import { CardTile, Avatar, dueState } from '@/components/kanban/KanbanBits';
import CardDialog from '@/components/kanban/CardDialog';

type DueFilter = 'all' | 'overdue' | 'soon' | 'none' | 'done';

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
  const [loading, setLoading] = useState(true);

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
  const [menuOpen, setMenuOpen] = useState<null | 'activity' | 'archive' | 'labels'>(null);
  const [activity, setActivity] = useState<KActivity[]>([]);

  const load = useCallback(async () => {
    try {
      const [b, content] = await Promise.all([getBoard(id), getBoardContent(id)]);
      if (!b) { toast.error('Доска не найдена'); navigate('/boards'); return; }
      setBoard(b); setLists(content.lists); setCards(content.cards); setLabels(content.labels);
    } catch { toast.error('Не удалось загрузить доску'); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { load(); getManagers().then(m => setManagers(m.filter(x => x.is_active))).catch(() => {}); }, [load]);

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
    try { await createCard(id, listId, title, positionBetween(tail?.position, undefined)); await load(); }
    catch { toast.error('Не удалось добавить карточку'); }
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

  async function openMenu(kind: 'activity' | 'archive' | 'labels') {
    setMenuOpen(kind);
    if (kind === 'activity') setActivity(await getBoardActivity(id));
  }

  if (loading || !board) {
    return <AppLayout><div className="text-sm text-muted-foreground">Загрузка доски…</div></AppLayout>;
  }

  const bg = BOARD_BACKGROUNDS[board.background] ?? BOARD_BACKGROUNDS.emerald;
  const archivedCards = cards.filter(c => c.archived);
  const archivedLists = lists.filter(l => l.archived);

  return (
    <AppLayout>
      <div className="-m-4 md:-m-6 flex flex-col h-[calc(100dvh-104px)] lg:h-[calc(100dvh-48px)]" style={{ background: bg }}>
        {/* Шапка доски */}
        <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 bg-black/20 backdrop-blur-sm text-white flex-wrap">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => navigate('/boards')} aria-label="Все доски">
            <ArrowLeft size={16} />
          </Button>
          {editingTitle ? (
            <Input autoFocus defaultValue={board.title} className="h-8 w-56 bg-white text-foreground"
              onBlur={async e => { setEditingTitle(false); const t = e.target.value.trim(); if (t && t !== board.title) { setBoard({ ...board, title: t }); await updateBoard(id, { title: t }); } }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingTitle(false); }} />
          ) : (
            <button type="button" className="text-lg font-bold px-2 py-0.5 rounded hover:bg-white/20" onClick={() => setEditingTitle(true)}>{board.title}</button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" aria-label="Избранное"
            onClick={async () => { setBoard({ ...board, starred: !board.starred }); await updateBoard(id, { starred: !board.starred }); }}>
            <Star size={16} className={board.starred ? 'fill-yellow-300 text-yellow-300' : ''} />
          </Button>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-300 text-amber-950 font-medium">в разработке</span>

          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/70" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск карточек"
                className="h-8 w-40 md:w-52 rounded-md bg-white/20 placeholder:text-white/70 text-white text-sm pl-7 pr-2 outline-none focus:bg-white focus:text-foreground focus:placeholder:text-muted-foreground" />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className={`h-8 text-white hover:bg-white/20 ${filtering ? 'bg-white/25' : ''}`}>
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
                {filtering && <Button size="sm" variant="outline" className="w-full" onClick={() => { setQ(''); setFLabels([]); setFMembers([]); setFDue('all'); }}>Сбросить фильтр</Button>}
              </PopoverContent>
            </Popover>
            <div className="hidden md:flex -space-x-1.5 mx-1">{managers.slice(0, 5).map(m => <Avatar key={m.id} m={m} size={26} />)}</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" aria-label="Меню доски"><MoreHorizontal size={16} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => openMenu('activity')}><Activity size={14} className="mr-2" />История действий</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openMenu('labels')}><Tag size={14} className="mr-2" />Метки</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openMenu('archive')}><Archive size={14} className="mr-2" />Архив ({archivedCards.length + archivedLists.length})</DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Palette size={12} />Фон доски</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {Object.entries(BOARD_BACKGROUNDS).map(([k, v]) => (
                      <button key={k} type="button" aria-label={k} onClick={async () => { setBoard({ ...board, background: k }); await updateBoard(id, { background: k }); }}
                        className={`h-7 rounded ${board.background === k ? 'ring-2 ring-offset-1 ring-primary' : ''}`} style={{ background: v }} />
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

        {/* Колонки */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden kanban-scroll">
          <div className="flex items-start gap-3 p-3 md:p-4 h-full">
            {activeLists.map(list => {
              const all = cardsOf(list.id);
              const visible = filtering ? all.filter(matches) : all;
              return (
                <div key={list.id}
                  className="shrink-0 w-[272px] max-h-full flex flex-col rounded-xl bg-[#f1f2f4] dark:bg-zinc-800 shadow-sm"
                  onDragOver={e => { if (dragList.current) e.preventDefault(); else onListBodyDragOver(e, list.id); }}
                  onDrop={e => { if (dragList.current) { e.preventDefault(); onListDrop(list.id); } else onCardDrop(e); }}>
                  {/* заголовок колонки — за него можно перетаскивать колонку */}
                  <div className="flex items-center gap-1 px-2 pt-2 pb-1 cursor-grab active:cursor-grabbing"
                    draggable={editingListId !== list.id}
                    onDragStart={e => { dragList.current = list.id; e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { dragList.current = null; }}>
                    {editingListId === list.id ? (
                      <Input autoFocus defaultValue={list.title} className="h-7 text-sm font-semibold"
                        onBlur={e => renameList(list, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingListId(null); }} />
                    ) : (
                      <button type="button" className="flex-1 text-left text-sm font-semibold px-1.5 py-1 rounded hover:bg-black/5 truncate" onClick={() => setEditingListId(list.id)}>
                        {list.title}
                      </button>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums px-1">{filtering ? `${visible.length}/${all.length}` : all.length}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Меню колонки"><MoreHorizontal size={14} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => { setAddingIn(list.id); setNewCardTitle(''); }}><Plus size={14} className="mr-2" />Добавить карточку</DropdownMenuItem>
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
                        <div draggable
                          onDragStart={e => { dragCard.current = c.id; setDraggingId(c.id); e.dataTransfer.effectAllowed = 'move'; }}
                          onDragEnd={() => { dragCard.current = null; setDraggingId(null); setDropHint(null); }}
                          onDragOver={e => onCardDragOver(e, list.id, i)}>
                          <CardTile card={c} labels={labels} members={managers} dragging={draggingId === c.id}
                            onOpen={() => setSearchParams({ card: c.id })} />
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
                        </div>
                      </div>
                    )}
                  </div>
                  {addingIn !== list.id && (
                    <button type="button" onClick={() => { setAddingIn(list.id); setNewCardTitle(''); }}
                      className="m-2 mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-black/5 text-left">
                      <Plus size={15} />Добавить карточку
                    </button>
                  )}
                </div>
              );
            })}

            {/* новая колонка */}
            <div className="shrink-0 w-[272px]">
              {addingList ? (
                <div className="rounded-xl bg-[#f1f2f4] dark:bg-zinc-800 p-2 space-y-1.5">
                  <Input autoFocus value={newListTitle} placeholder="Название колонки" onChange={e => setNewListTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addList(); if (e.key === 'Escape') setAddingList(false); }} />
                  <div className="flex items-center gap-1">
                    <Button size="sm" className="h-8" onClick={addList}>Добавить колонку</Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAddingList(false)}><X size={16} /></Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingList(true)}
                  className="w-full flex items-center gap-1.5 rounded-xl bg-white/25 hover:bg-white/35 text-white px-3 py-2.5 text-sm font-medium">
                  <Plus size={15} />Добавить ещё одну колонку
                </button>
              )}
            </div>
          </div>
        </div>
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
          onClose={() => setSearchParams({})}
          onChanged={load}
        />
      )}

      {/* Боковое меню: история, архив, метки */}
      <Sheet open={menuOpen !== null} onOpenChange={o => { if (!o) setMenuOpen(null); }}>
        <SheetContent className="w-[360px] sm:w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{menuOpen === 'activity' ? 'История действий' : menuOpen === 'archive' ? 'Архив' : 'Метки доски'}</SheetTitle>
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
