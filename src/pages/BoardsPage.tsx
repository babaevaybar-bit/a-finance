import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Star, Archive, RotateCcw, Trash2, KanbanSquare, FolderOpen, Table2, CalendarDays, Download, MoreHorizontal } from 'lucide-react';
import { getManagers } from '@/lib/api';
import type { Manager } from '@/types/types';
import { MonthCalendar } from '@/components/kanban/views/CalendarView';
import { Avatar, dueState, DUE_STYLE, formatDue } from '@/components/kanban/KanbanBits';
import {
  getBoards, getArchivedBoards, createBoard, updateBoard, deleteBoard, getWorkspaceCards, updateCard, labelHex,
  BOARD_BACKGROUNDS, BOARD_MATERIALS, BOARD_TEMPLATES, isLightBoard, type KBoard, type KWorkspaceCard,
} from '@/lib/kanban';

/** «Доски» — список досок в стиле Trello: избранные сверху, создание из шаблона, архив. */
export default function BoardsPage() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<KBoard[]>([]);
  const [archived, setArchived] = useState<KBoard[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [bg, setBg] = useState('oak');
  const [tpl, setTpl] = useState('production');
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<'boards' | 'table' | 'calendar'>('boards');
  const [wsCards, setWsCards] = useState<KWorkspaceCard[] | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [collection, setCollection] = useState<string>('all');
  useEffect(() => {
    if (tab === 'boards' || wsCards) return;
    Promise.all([getWorkspaceCards(), getManagers()]).then(([c, m]) => { setWsCards(c); setManagers(m); }).catch(() => toast.error('Не удалось загрузить карточки'));
  }, [tab, wsCards]);

  async function load() {
    try {
      const [b, a] = await Promise.all([getBoards(), getArchivedBoards()]);
      setBoards(b); setArchived(a);
    } catch { toast.error('Не удалось загрузить доски'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const id = await createBoard(title.trim(), bg, tpl);
      setCreateOpen(false); setTitle('');
      navigate(`/boards/${id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setCreating(false); }
  }

  async function toggleStar(b: KBoard, e: React.MouseEvent) {
    e.stopPropagation();
    setBoards(prev => prev.map(x => x.id === b.id ? { ...x, starred: !x.starred } : x));
    await updateBoard(b.id, { starred: !b.starred }).catch(() => {});
  }

  const collections = [...new Set(boards.map(b => b.collection).filter(Boolean))] as string[];
  const shownBoards = collection === 'all' ? boards : boards.filter(b => (b.collection ?? '') === collection);
  const starred = shownBoards.filter(b => b.starred);
  async function setBoardCollection(b: KBoard, e: React.MouseEvent) {
    e.stopPropagation();
    const name = window.prompt('Коллекция для доски (например «Производство», «Офис»). Оставьте пустым, чтобы убрать.', b.collection ?? '');
    if (name === null) return;
    await updateBoard(b.id, { collection: name.trim() || null });
    load();
  }
  async function exportWs() {
    if (!wsCards) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(wsCards.map(c => ({
      'Карточка': c.title, 'Доска': c.board_title, 'Колонка': c.list_title,
      'Участники': managers.filter(m => c.member_ids.includes(m.id)).map(m => m.name).join(', '),
      'Метки': c.label_names.map(l => l.name).join(', '),
      'Срок': c.due_at ? new Date(c.due_at).toLocaleString('ru-RU') : '', 'Выполнено': c.due_done ? 'да' : '',
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Все карточки'); XLSX.writeFile(wb, 'Все доски.xlsx');
  }
  // Плитка доски: фон-отделка, мини-превью колонок (высота полоски = число карточек), счётчики
  const tile = (b: KBoard) => {
    const light = isLightBoard(b.background);
    const pv = (b.preview ?? []).slice(0, 8);
    const max = Math.max(1, ...pv.map(p => p.count));
    const ago = (() => {
      const m = Math.round((Date.now() - new Date(b.updated_at).getTime()) / 60000);
      if (m < 60) return m <= 1 ? 'только что' : `${m} мин назад`;
      const h = Math.round(m / 60); if (h < 24) return `${h} ч назад`;
      const d = Math.round(h / 24); return d === 1 ? 'вчера' : `${d} дн. назад`;
    })();
    return (
      <button key={b.id} type="button" onClick={() => navigate(`/boards/${b.id}`)}
        className={`group relative h-36 rounded-2xl p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.15),0_10px_24px_-14px_rgba(0,0,0,.5)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${light ? 'text-[#22272b]' : 'text-white'}`}
        style={{ background: BOARD_BACKGROUNDS[b.background] ?? BOARD_BACKGROUNDS.emerald }}>
        <div className="font-display font-bold text-[15px] leading-tight line-clamp-2 pr-12">{b.starred && <Star size={12} className="inline -mt-0.5 mr-1 fill-yellow-300 text-yellow-300" />}{b.title}</div>
        <div className={`mt-1 text-[11px] flex flex-wrap gap-x-2 gap-y-0.5 ${light ? 'text-black/55' : 'text-white/75'}`}>
          <span>{b.card_count ?? 0} карточек</span>
          {!!b.overdue_count && <span className="font-semibold text-white bg-red-600 rounded-full px-1.5">просрочено {b.overdue_count}</span>}
          {b.collection && <span className={`rounded px-1.5 ${light ? 'bg-black/10' : 'bg-black/25'}`}>{b.collection}</span>}
        </div>
        <div className={`text-[10.5px] ${light ? 'text-black/45' : 'text-white/60'}`}>обновлено {ago}</div>
        {/* мини-превью колонок */}
        <div className="absolute left-3.5 right-3.5 bottom-3 flex items-end gap-1 h-9">
          {pv.length === 0 ? <span className={`text-[11px] ${light ? 'text-black/45' : 'text-white/60'}`}>нет колонок</span> : pv.map((p, i) => (
            <div key={i} title={`${p.title}: ${p.count}`} className="flex-1 rounded-[3px]"
              style={{ height: `${18 + (p.count / max) * 82}%`, background: p.color ? 'rgba(255,255,255,.9)' : light ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.32)', boxShadow: p.color ? 'inset 0 3px 0 ' + ({ green: '#4bce97', yellow: '#e2b203', orange: '#fea362', red: '#f87168', purple: '#9f8fef', blue: '#579dff', sky: '#6cc3e0', lime: '#94c748', pink: '#e774bb', black: '#8590a2' } as Record<string, string>)[p.color] : undefined }} />
          ))}
        </div>
        <span className="absolute right-2.5 top-2.5 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
          <span onClick={e => setBoardCollection(b, e)} role="button" aria-label="Коллекция" title="Добавить в коллекцию"
            className={`h-7 w-7 rounded-md flex items-center justify-center ${light ? 'bg-white/70' : 'bg-black/30'}`}><MoreHorizontal size={15} /></span>
          <span onClick={e => toggleStar(b, e)} role="button" aria-label="В избранное" title="В избранное"
            className={`h-7 w-7 rounded-md flex items-center justify-center ${light ? 'bg-white/70' : 'bg-black/30'}`}>
            <Star size={15} className={b.starred ? 'fill-yellow-300 text-yellow-300' : ''} />
          </span>
        </span>
      </button>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
              Доски <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">в разработке</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Замеры, производство, монтаж и задачи офиса — каждая работа видна от начала до конца.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus size={15} className="mr-1.5" />Создать доску</Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {([['boards', 'Доски', KanbanSquare], ['table', 'Все карточки — таблица', Table2], ['calendar', 'Календарь всех досок', CalendarDays]] as const).map(([k, t, I]) => (
            <Button key={k} size="sm" variant={tab === k ? 'default' : 'outline'} className="h-8" onClick={() => setTab(k)}><I size={13} className="mr-1.5" />{t}</Button>
          ))}
          {tab === 'boards' && collections.length > 0 && (
            <div className="flex flex-wrap gap-1 ml-auto">
              <Button size="sm" variant={collection === 'all' ? 'secondary' : 'ghost'} className="h-8" onClick={() => setCollection('all')}>Все коллекции</Button>
              {collections.map(c => <Button key={c} size="sm" variant={collection === c ? 'secondary' : 'ghost'} className="h-8" onClick={() => setCollection(c)}><FolderOpen size={13} className="mr-1" />{c}</Button>)}
            </div>
          )}
        </div>

        {tab === 'table' && (
          !wsCards ? <div className="h-40 rounded-xl bg-muted animate-pulse" /> : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">{wsCards.length} карточек на всех досках</span>
                <Button size="sm" variant="outline" className="h-8" onClick={exportWs}><Download size={13} className="mr-1.5" />Выгрузить в Excel</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40"><tr>
                    {['Карточка', 'Доска', 'Колонка', 'Метки', 'Участники', 'Срок'].map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {[...wsCards].sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999')).map(c => {
                      const ds = dueState(c);
                      return (
                        <tr key={c.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/boards/${c.board_id}?card=${c.id}`)}>
                          <td className="px-3 py-2 font-medium">{c.title}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{c.board_title}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{c.list_title}</td>
                          <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{c.label_names.map((l, i) => <span key={i} className="text-[10px] font-semibold rounded px-1.5 py-0.5 text-black/75" style={{ background: labelHex(l.color) }}>{l.name}</span>)}</div></td>
                          <td className="px-3 py-2"><div className="flex -space-x-1.5">{managers.filter(m => c.member_ids.includes(m.id)).map(m => <Avatar key={m.id} m={m} size={22} />)}</div></td>
                          <td className="px-3 py-2 whitespace-nowrap">{c.due_at && <span className={`text-xs rounded px-1.5 py-0.5 ${ds && ds !== 'normal' ? DUE_STYLE[ds] : ''}`}>{formatDue(c.due_at)}</span>}</td>
                        </tr>
                      );
                    })}
                    {wsCards.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Пока нет карточек</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
        {tab === 'calendar' && (
          !wsCards ? <div className="h-40 rounded-xl bg-muted animate-pulse" /> : (
            <div className="h-[calc(100dvh-260px)] min-h-[560px]">
              <MonthCalendar
                items={wsCards.map(c => ({ id: c.id, title: c.title, due_at: c.due_at, due_done: c.due_done, color: c.cover_color, sub: c.board_title }))}
                onOpen={cid => { const c = wsCards.find(x => x.id === cid); if (c) navigate(`/boards/${c.board_id}?card=${c.id}`); }}
                onMove={async (cid, due) => { setWsCards(p => p?.map(c => c.id === cid ? { ...c, due_at: due } : c) ?? null); await updateCard(cid, { due_at: due }).catch(() => toast.error('Не удалось перенести срок')); }} />
            </div>
          )
        )}

        {tab === 'boards' && (loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
{[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : (
          <>
            {starred.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><Star size={14} />Избранные</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{starred.map(tile)}</div>
              </section>
            )}
            {boards.length === 0 && (
              <section className="rounded-2xl p-6 md:p-8 text-white space-y-4" style={{ background: BOARD_BACKGROUNDS.walnut }}>
                <div className="font-display text-2xl font-bold max-w-lg">Начните с доски производства</div>
                <p className="text-white/80 max-w-lg text-sm">Колонки — этапы: замер, заказ, производство, склад, монтаж. Каждый заказ — карточка, которую двигают по этапам. Всё создастся за секунду, потом можно поменять.</p>
                <div className="flex flex-wrap gap-2">
                  <Button className="bg-white text-[#3a2217] hover:bg-white/90" disabled={creating} onClick={async () => {
                    setCreating(true);
                    try { const id = await createBoard('Производство дверей', 'oak', 'production'); navigate(`/boards/${id}`); }
                    catch { toast.error('Не удалось создать доску'); } finally { setCreating(false); }
                  }}>Создать «Производство дверей»</Button>
                  <Button variant="outline" className="bg-transparent text-white border-white/40 hover:bg-white/10" onClick={() => setCreateOpen(true)}>Своя доска</Button>
                </div>
              </section>
            )}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5"><KanbanSquare size={14} />Все доски</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {shownBoards.map(tile)}
                <button type="button" onClick={() => setCreateOpen(true)}
                  className="h-36 rounded-2xl border-2 border-dashed border-border text-sm text-muted-foreground hover:bg-muted/50 hover:border-primary/40 transition">
                  + Новая доска
                </button>
              </div>
            </section>
            {archived.length > 0 && (
              <section className="space-y-2">
                <button type="button" className="text-sm text-muted-foreground hover:underline flex items-center gap-1.5" onClick={() => setShowArchived(v => !v)}>
                  <Archive size={14} />Архив досок ({archived.length})
                </button>
                {showArchived && (
                  <div className="space-y-1.5 max-w-lg">
                    {archived.map(b => (
                      <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                        <span className="truncate">{b.title}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => { await updateBoard(b.id, { archived: false }); load(); }}>
                            <RotateCcw size={12} className="mr-1" />Вернуть
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={async () => {
                            if (!window.confirm(`Удалить доску «${b.title}» навсегда вместе со всеми карточками?`)) return;
                            await deleteBoard(b.id); load();
                          }}><Trash2 size={12} /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md grid-cols-[minmax(0,1fr)]">
          <DialogHeader><DialogTitle>Новая доска</DialogTitle></DialogHeader>
          <div className="space-y-4 min-w-0">
            <div className={`h-20 rounded-xl p-3 font-display font-bold break-words line-clamp-2 ${isLightBoard(bg) ? 'text-[#22272b]' : 'text-white'}`} style={{ background: BOARD_BACKGROUNDS[bg] }}>{title || 'Название доски'}</div>
            <div className="space-y-1.5">
              <Label>Отделка доски</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {BOARD_MATERIALS.slice(0, 10).map(m => (
                  <button key={m.key} type="button" onClick={() => setBg(m.key)} aria-label={m.name} title={m.name}
                    className={`h-9 rounded-md text-[10px] font-medium flex items-end justify-center pb-0.5 ${m.light ? 'text-black/60' : 'text-white/90'} ${bg === m.key ? 'ring-2 ring-offset-2 ring-primary' : ''}`} style={{ background: m.css }}>{m.name}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Название</Label>
              <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Производство октябрь"
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Шаблон колонок</Label>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {BOARD_TEMPLATES.map(t => (
                  <button key={t.key} type="button" onClick={() => setTpl(t.key)}
                    className={`min-w-0 text-left rounded-lg border px-3 py-2 text-sm ${tpl === t.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground leading-snug break-words">{t.lists.join(' → ')}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button disabled={!title.trim() || creating} onClick={handleCreate}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
