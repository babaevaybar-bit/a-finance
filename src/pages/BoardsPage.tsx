import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Star, Archive, RotateCcw, Trash2, KanbanSquare } from 'lucide-react';
import {
  getBoards, getArchivedBoards, createBoard, updateBoard, deleteBoard,
  BOARD_BACKGROUNDS, BOARD_TEMPLATES, type KBoard,
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
  const [bg, setBg] = useState('emerald');
  const [tpl, setTpl] = useState('production');
  const [creating, setCreating] = useState(false);

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

  const starred = boards.filter(b => b.starred);
  const tile = (b: KBoard) => (
    <button key={b.id} type="button" onClick={() => navigate(`/boards/${b.id}`)}
      className="group relative h-24 rounded-xl p-3 text-left text-white font-semibold shadow-sm hover:brightness-110 transition"
      style={{ background: BOARD_BACKGROUNDS[b.background] ?? BOARD_BACKGROUNDS.emerald }}>
      <span className="line-clamp-2 drop-shadow-sm">{b.title}</span>
      <span onClick={e => toggleStar(b, e)} role="button" aria-label="В избранное"
        className={`absolute right-2 bottom-2 transition-opacity ${b.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <Star size={16} className={b.starred ? 'fill-yellow-300 text-yellow-300' : 'text-white'} />
      </span>
    </button>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              Доски <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">в разработке</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Свои доски вместо Trello: колонки, карточки, метки, сроки, чек-листы, комментарии и файлы.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus size={15} className="mr-1.5" />Создать доску</Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : (
          <>
            {starred.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5"><Star size={14} />Избранные</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{starred.map(tile)}</div>
              </section>
            )}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5"><KanbanSquare size={14} />Все доски</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {boards.map(tile)}
                <button type="button" onClick={() => setCreateOpen(true)}
                  className="h-24 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:bg-muted/50 transition">
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
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md grid-cols-[minmax(0,1fr)]">
          <DialogHeader><DialogTitle>Новая доска</DialogTitle></DialogHeader>
          <div className="space-y-4 min-w-0">
            <div className="h-20 rounded-xl p-3 text-white font-semibold break-words line-clamp-2" style={{ background: BOARD_BACKGROUNDS[bg] }}>{title || 'Название доски'}</div>
            <div className="space-y-1.5">
              <Label>Фон</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(BOARD_BACKGROUNDS).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setBg(k)} aria-label={k}
                    className={`h-8 w-10 rounded-md ${bg === k ? 'ring-2 ring-offset-2 ring-primary' : ''}`} style={{ background: v }} />
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
