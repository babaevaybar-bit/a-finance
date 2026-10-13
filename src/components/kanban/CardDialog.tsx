import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import {
  CreditCard, AlignLeft, CheckSquare, Paperclip, MessageSquare, Users, Tag, Clock, Image as ImageIcon,
  ArrowRight, Copy, Archive, Trash2, Activity, Link2, Plus, Check, X, FileText, Download,
} from 'lucide-react';
import { getRecentDealsForLinking } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { Manager } from '@/types/types';
import {
  updateCard, deleteCard, copyCard, toggleCardLabel, toggleCardMember, createLabel,
  getCardDetails, addChecklist, renameChecklist, deleteChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem,
  addComment, deleteComment, uploadAttachment, attachmentUrl, deleteAttachment, logActivity, positionBetween,
  LABEL_COLORS, labelHex, lastOf,
  type KBoard, type KCard, type KList, type KLabel, type KChecklist, type KComment, type KAttachment, type KActivity,
} from '@/lib/kanban';
import { Avatar, dueState, DUE_STYLE, formatDue } from './KanbanBits';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Открытая карточка — как в Trello: слева содержимое, справа действия. */
export default function CardDialog({ card, board, lists, labels, managers, cardsOfList, onLabelsChanged, onClose, onChanged }: {
  card: KCard; board: KBoard; lists: KList[]; labels: KLabel[]; managers: Manager[];
  cardsOfList: (listId: string) => KCard[];
  onLabelsChanged: (l: KLabel[]) => void; onClose: () => void; onChanged: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [checklists, setChecklists] = useState<KChecklist[]>([]);
  const [comments, setComments] = useState<KComment[]>([]);
  const [attachments, setAttachments] = useState<KAttachment[]>([]);
  const [activity, setActivity] = useState<KActivity[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [hideDone, setHideDone] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [deals, setDeals] = useState<{ id: string; client_name: string | null; total_amount: number; deal_date: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = lists.find(l => l.id === card.list_id);
  const cardLabels = labels.filter(l => card.label_ids.includes(l.id));
  const cardMembers = managers.filter(m => card.member_ids.includes(m.id));
  const ds = dueState(card);

  async function loadDetails() {
    const d = await getCardDetails(card.id);
    setChecklists(d.checklists); setComments(d.comments); setAttachments(d.attachments); setActivity(d.activity);
  }
  useEffect(() => { loadDetails(); }, [card.id]);
  useEffect(() => { setTitle(card.title); setDesc(card.description ?? ''); }, [card.title, card.description]);

  async function save(patch: Parameters<typeof updateCard>[1], log?: string) {
    try { await updateCard(card.id, patch); if (log) logActivity(board.id, log, card.id); onChanged(); }
    catch { toast.error('Не удалось сохранить'); }
  }

  // ── Чек-листы ──
  async function addItem(cl: KChecklist) {
    const text = (newItem[cl.id] ?? '').trim();
    if (!text) return;
    setNewItem(p => ({ ...p, [cl.id]: '' }));
    await addChecklistItem(cl.id, text, positionBetween(lastOf(cl.items)?.position, undefined));
    await loadDetails(); onChanged();
  }
  async function toggleItem(itemId: string, done: boolean, text: string) {
    setChecklists(prev => prev.map(c => ({ ...c, items: c.items.map(i => i.id === itemId ? { ...i, done } : i) })));
    await updateChecklistItem(itemId, { done });
    if (done) logActivity(board.id, `отметил(а) «${text}» выполненным в «${card.title}»`, card.id);
    onChanged();
  }

  // ── Файлы ──
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 25 * 1024 * 1024) { toast.error(`«${f.name}» больше 25 МБ`); continue; }
        await uploadAttachment(card.id, f);
        logActivity(board.id, `прикрепил(а) «${f.name}» к «${card.title}»`, card.id);
      }
      await loadDetails(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось загрузить файл'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  async function openFile(a: KAttachment) {
    const url = await attachmentUrl(a.path);
    if (url) window.open(url, '_blank', 'noopener'); else toast.error('Не удалось открыть файл');
  }

  async function sendComment() {
    const text = comment.trim();
    if (!text) return;
    setComment('');
    try { await addComment(card.id, text); await loadDetails(); onChanged(); }
    catch { toast.error('Комментарий не сохранился'); }
  }

  const SideBtn = ({ icon: Icon, children, ...rest }: { icon: React.ElementType; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...rest}
      className="w-full flex items-center gap-2 rounded-md bg-muted/70 hover:bg-muted px-2.5 py-1.5 text-sm text-left transition-colors">
      <Icon size={14} className="shrink-0" />{children}
    </button>
  );

  const membersPicker = (
    <Popover>
      <PopoverTrigger asChild><div><SideBtn icon={Users}>Участники</SideBtn></div></PopoverTrigger>
      <PopoverContent className="w-64 p-2 space-y-1" align="start">
        <div className="text-xs font-semibold text-muted-foreground px-1 pb-1">Сотрудники</div>
        {managers.map(m => {
          const on = card.member_ids.includes(m.id);
          return (
            <button key={m.id} type="button" className="w-full flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted text-sm"
              onClick={async () => { await toggleCardMember(card.id, m.id, !on); if (!on) logActivity(board.id, `добавил(а) ${m.name} в «${card.title}»`, card.id); onChanged(); }}>
              <Avatar m={m} size={22} /><span className="flex-1 text-left">{m.name}</span>{on && <Check size={14} />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );

  const labelsPicker = (
    <Popover>
      <PopoverTrigger asChild><div><SideBtn icon={Tag}>Метки</SideBtn></div></PopoverTrigger>
      <PopoverContent className="w-64 p-2 space-y-1.5" align="start"><LabelsPicker card={card} board={board} labels={labels} onLabelsChanged={onLabelsChanged} onChanged={onChanged} /></PopoverContent>
    </Popover>
  );

  const datesPicker = (
    <Popover>
      <PopoverTrigger asChild><div><SideBtn icon={Clock}>Даты</SideBtn></div></PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="start">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">Начало</div>
          <Input type="date" defaultValue={card.start_at ?? ''} onChange={e => save({ start_at: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground">Срок</div>
          <Input type="datetime-local" defaultValue={toLocalInput(card.due_at)}
            onChange={e => save({ due_at: e.target.value ? new Date(e.target.value).toISOString() : null }, e.target.value ? `установил(а) срок для «${card.title}»` : undefined)} />
        </div>
        {(card.due_at || card.start_at) && (
          <Button size="sm" variant="outline" className="w-full" onClick={() => save({ due_at: null, start_at: null, due_done: false })}>Убрать даты</Button>
        )}
      </PopoverContent>
    </Popover>
  );

  const coverPicker = (
    <Popover>
      <PopoverTrigger asChild><div><SideBtn icon={ImageIcon}>Обложка</SideBtn></div></PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2" align="start">
        <div className="grid grid-cols-5 gap-1.5">
          {LABEL_COLORS.map(c => (
            <button key={c.key} type="button" title={c.name} onClick={() => save({ cover_color: c.key })}
              className={`h-8 rounded ${card.cover_color === c.key ? 'ring-2 ring-offset-1 ring-primary' : ''}`} style={{ background: c.hex }} />
          ))}
        </div>
        {card.cover_color && <Button size="sm" variant="outline" className="w-full" onClick={() => save({ cover_color: null })}>Убрать обложку</Button>}
      </PopoverContent>
    </Popover>
  );

  const movePicker = (mode: 'move' | 'copy') => (
    <Popover>
      <PopoverTrigger asChild><div><SideBtn icon={mode === 'move' ? ArrowRight : Copy}>{mode === 'move' ? 'Переместить' : 'Копировать'}</SideBtn></div></PopoverTrigger>
      <PopoverContent className="w-60 p-2 space-y-1" align="start">
        <div className="text-xs font-semibold text-muted-foreground px-1 pb-1">{mode === 'move' ? 'Переместить в колонку' : 'Копировать в колонку'}</div>
        {lists.map(l => (
          <button key={l.id} type="button" disabled={mode === 'move' && l.id === card.list_id}
            className="w-full text-left rounded px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            onClick={async () => {
              const prevLast = lastOf(cardsOfList(l.id).filter(c => c.id !== card.id));
              const pos = positionBetween(prevLast?.position, undefined);
              if (mode === 'move') await save({ list_id: l.id, position: pos }, `переместил(а) «${card.title}»: ${list?.title} → ${l.title}`);
              else { await copyCard(card, l.id, pos); logActivity(board.id, `скопировал(а) «${card.title}» в «${l.title}»`); onChanged(); toast.success('Карточка скопирована'); }
            }}>
            {l.title}{l.id === card.list_id ? ' (текущая)' : ''}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );

  const dealPicker = (
    <Popover onOpenChange={o => { if (o && deals.length === 0) getRecentDealsForLinking().then(setDeals).catch(() => {}); }}>
      <PopoverTrigger asChild><div><SideBtn icon={Link2}>Сделка</SideBtn></div></PopoverTrigger>
      <PopoverContent className="w-72 p-2 max-h-80 overflow-y-auto space-y-1" align="start">
        <div className="text-xs font-semibold text-muted-foreground px-1 pb-1">Связать со сделкой из «Продаж»</div>
        {card.deal_id && <Button size="sm" variant="outline" className="w-full mb-1" onClick={() => save({ deal_id: null })}>Отвязать</Button>}
        {deals.map(d => (
          <button key={d.id} type="button" className={`w-full text-left rounded px-2 py-1.5 text-sm hover:bg-muted ${card.deal_id === d.id ? 'bg-primary/10' : ''}`}
            onClick={() => save({ deal_id: d.id }, `связал(а) «${card.title}» со сделкой ${d.client_name ?? ''}`)}>
            <div className="truncate">{d.client_name || 'Без имени'}</div>
            <div className="text-[11px] text-muted-foreground">{formatCurrency(d.total_amount)} · {new Date(d.deal_date).toLocaleDateString('ru-RU')}</div>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
  const linkedDeal = deals.find(d => d.id === card.deal_id);
  useEffect(() => { if (card.deal_id && !linkedDeal) getRecentDealsForLinking().then(setDeals).catch(() => {}); }, [card.deal_id]);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-1.5rem)] md:max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        {card.cover_color && <div className="h-24 rounded-t-lg" style={{ background: labelHex(card.cover_color) }} />}
        <div className="p-4 md:p-6 space-y-5">
          {/* Заголовок */}
          <div className="flex gap-3 pr-6">
            <CreditCard size={18} className="mt-1.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <DialogTitle className="sr-only">{card.title}</DialogTitle>
              <Textarea value={title} rows={1} onChange={e => setTitle(e.target.value)}
                className="text-lg font-semibold border-transparent shadow-none px-1 min-h-0 resize-none focus-visible:border-input"
                onBlur={() => { if (title.trim() && title.trim() !== card.title) save({ title: title.trim() }); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
              <div className="text-xs text-muted-foreground px-1">в колонке <span className="underline">{list?.title}</span></div>
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_180px] gap-5">
            <div className="space-y-6 min-w-0">
              {/* Участники, метки, срок */}
              {(cardMembers.length > 0 || cardLabels.length > 0 || card.due_at || card.start_at || card.deal_id) && (
                <div className="flex flex-wrap gap-5 pl-7">
                  {cardMembers.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Участники</div>
                      <div className="flex gap-1">{cardMembers.map(m => <Avatar key={m.id} m={m} size={30} />)}</div>
                    </div>
                  )}
                  {cardLabels.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Метки</div>
                      <div className="flex flex-wrap gap-1">
                        {cardLabels.map(l => <span key={l.id} className="h-8 min-w-[48px] px-3 rounded text-sm leading-8 font-semibold text-black/75" style={{ background: labelHex(l.color) }}>{l.name}</span>)}
                      </div>
                    </div>
                  )}
                  {(card.due_at || card.start_at) && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">{card.start_at && card.due_at ? 'Даты' : card.due_at ? 'Срок' : 'Начало'}</div>
                      <div className="flex items-center gap-2 h-8">
                        {card.due_at && <Checkbox checked={card.due_done} onCheckedChange={v => save({ due_done: !!v }, v ? `отметил(а) «${card.title}» выполненной` : undefined)} aria-label="Выполнено" />}
                        <span className="text-sm rounded bg-muted px-2 py-1">
                          {card.start_at ? new Date(card.start_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}
                          {card.start_at && card.due_at ? ' — ' : ''}
                          {card.due_at ? formatDue(card.due_at) : ''}
                        </span>
                        {ds && ds !== 'normal' && <span className={`text-[11px] rounded px-1.5 py-0.5 ${DUE_STYLE[ds]}`}>{ds === 'done' ? 'выполнено' : ds === 'overdue' ? 'просрочено' : 'скоро срок'}</span>}
                      </div>
                    </div>
                  )}
                  {card.deal_id && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Сделка</div>
                      <div className="h-8 flex items-center text-sm rounded bg-muted px-2">
                        <Link2 size={13} className="mr-1.5" />{linkedDeal ? `${linkedDeal.client_name ?? 'Без имени'} · ${formatCurrency(linkedDeal.total_amount)}` : 'связана'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Описание */}
              <section className="space-y-2">
                <div className="flex items-center gap-3">
                  <AlignLeft size={18} className="text-muted-foreground" />
                  <h3 className="font-semibold text-sm flex-1">Описание</h3>
                  {!editingDesc && desc && <Button size="sm" variant="secondary" className="h-7" onClick={() => setEditingDesc(true)}>Изменить</Button>}
                </div>
                <div className="pl-7">
                  {editingDesc ? (
                    <div className="space-y-2">
                      <Textarea autoFocus rows={5} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Подробности задачи, адрес, размеры, договорённости…" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={async () => { setEditingDesc(false); await save({ description: desc.trim() || null }); }}>Сохранить</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingDesc(false); setDesc(card.description ?? ''); }}>Отмена</Button>
                      </div>
                    </div>
                  ) : desc ? (
                    <div className="text-sm whitespace-pre-wrap break-words cursor-pointer" onClick={() => setEditingDesc(true)}>{desc}</div>
                  ) : (
                    <button type="button" onClick={() => setEditingDesc(true)} className="w-full text-left text-sm text-muted-foreground rounded-md bg-muted/60 hover:bg-muted px-3 py-3">
                      Добавить более подробное описание…
                    </button>
                  )}
                </div>
              </section>

              {/* Вложения */}
              {attachments.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Paperclip size={18} className="text-muted-foreground" />
                    <h3 className="font-semibold text-sm flex-1">Вложения</h3>
                    <Button size="sm" variant="secondary" className="h-7" disabled={uploading} onClick={() => fileRef.current?.click()}>Добавить</Button>
                  </div>
                  <div className="pl-7 space-y-1.5">
                    {attachments.map(a => (
                      <div key={a.id} className="flex items-center gap-3 rounded-md hover:bg-muted/60 p-1.5">
                        <div className="h-10 w-14 rounded bg-muted flex items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground shrink-0">
                          {a.mime?.startsWith('image/') ? <ImageIcon size={16} /> : (a.name.split('.').pop() ?? <FileText size={16} />)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button type="button" className="text-sm font-medium truncate block hover:underline text-left max-w-full" onClick={() => openFile(a)}>{a.name}</button>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(a.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ''}{a.size ? ` · ${(a.size / 1024 / 1024).toFixed(1)} МБ` : ''}
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openFile(a)} aria-label="Открыть"><Download size={13} /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Удалить"
                          onClick={async () => { if (!window.confirm(`Удалить «${a.name}»?`)) return; await deleteAttachment(a); await loadDetails(); onChanged(); }}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Чек-листы */}
              {checklists.map(cl => {
                const done = cl.items.filter(i => i.done).length;
                const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0;
                const items = hideDone[cl.id] ? cl.items.filter(i => !i.done) : cl.items;
                return (
                  <section key={cl.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <CheckSquare size={18} className="text-muted-foreground" />
                      <input defaultValue={cl.title} className="font-semibold text-sm flex-1 bg-transparent outline-none rounded px-1 focus:bg-muted"
                        onBlur={e => { if (e.target.value.trim() && e.target.value !== cl.title) renameChecklist(cl.id, e.target.value.trim()); }} />
                      {done > 0 && <Button size="sm" variant="secondary" className="h-7" onClick={() => setHideDone(p => ({ ...p, [cl.id]: !p[cl.id] }))}>{hideDone[cl.id] ? 'Показать отмеченные' : 'Скрыть отмеченные'}</Button>}
                      <Button size="sm" variant="secondary" className="h-7" onClick={async () => { if (!window.confirm(`Удалить чек-лист «${cl.title}»?`)) return; await deleteChecklist(cl.id); await loadDetails(); onChanged(); }}>Удалить</Button>
                    </div>
                    <div className="flex items-center gap-2 pl-7">
                      <span className="text-[11px] w-8 text-muted-foreground tabular-nums">{pct}%</span>
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-600' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="pl-7 space-y-0.5">
                      {items.map(i => (
                        <div key={i.id} className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-muted/60">
                          <Checkbox className="mt-0.5" checked={i.done} onCheckedChange={v => toggleItem(i.id, !!v, i.text)} />
                          <span className={`flex-1 text-sm break-words ${i.done ? 'line-through text-muted-foreground' : ''}`}>{i.text}</span>
                          <button type="button" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" aria-label="Удалить пункт"
                            onClick={async () => { await deleteChecklistItem(i.id); await loadDetails(); onChanged(); }}><X size={14} /></button>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <Input className="h-8 text-sm" placeholder="Добавить элемент" value={newItem[cl.id] ?? ''}
                          onChange={e => setNewItem(p => ({ ...p, [cl.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') addItem(cl); }} />
                        <Button size="sm" className="h-8" onClick={() => addItem(cl)}>Добавить</Button>
                      </div>
                    </div>
                  </section>
                );
              })}

              {/* Комментарии и история */}
              <section className="space-y-3">
                <div className="flex items-center gap-3">
                  <MessageSquare size={18} className="text-muted-foreground" />
                  <h3 className="font-semibold text-sm flex-1">Комментарии и события</h3>
                  <Button size="sm" variant="secondary" className="h-7" onClick={() => setShowActivity(v => !v)}>{showActivity ? 'Скрыть подробности' : 'Показать подробности'}</Button>
                </div>
                <div className="pl-7 space-y-2">
                  <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Напишите комментарий…"
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendComment(); }} />
                  {comment.trim() && <Button size="sm" onClick={sendComment}>Сохранить</Button>}
                </div>
                <div className="pl-7 space-y-3">
                  {[
                    ...comments.map(c => ({ kind: 'c' as const, at: c.created_at, c })),
                    ...(showActivity ? activity.map(a => ({ kind: 'a' as const, at: a.created_at, a })) : []),
                  ].sort((x, y) => y.at.localeCompare(x.at)).map(row => row.kind === 'c' ? (
                    <div key={row.c.id} className="space-y-1">
                      <div className="text-sm"><span className="font-semibold">{row.c.author_name ?? 'Сотрудник'}</span>
                        <span className="text-[11px] text-muted-foreground ml-2">{new Date(row.c.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-sm rounded-md bg-card border border-border px-3 py-2 whitespace-pre-wrap break-words">{row.c.text}</div>
                      <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={async () => { if (!window.confirm('Удалить комментарий?')) return; await deleteComment(row.c.id); await loadDetails(); onChanged(); }}>Удалить</button>
                    </div>
                  ) : (
                    <div key={row.a.id} className="text-xs text-muted-foreground flex gap-1.5">
                      <Activity size={12} className="mt-0.5 shrink-0" />
                      <span><span className="font-medium text-foreground">{row.a.actor_name ?? 'Кто-то'}</span> {row.a.action}
                        <span className="ml-1.5">{new Date(row.a.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Действия */}
            <aside className="space-y-4">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground">Добавить на карточку</div>
                {membersPicker}
                {labelsPicker}
                <SideBtn icon={CheckSquare} onClick={async () => { await addChecklist(card.id, 'Чек-лист', positionBetween(lastOf(checklists)?.position, undefined)); await loadDetails(); onChanged(); }}>Чек-лист</SideBtn>
                {datesPicker}
                <SideBtn icon={Paperclip} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Загрузка…' : 'Вложение'}</SideBtn>
                {coverPicker}
                {dealPicker}
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => upload(e.target.files)} />
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground">Действия</div>
                {movePicker('move')}
                {movePicker('copy')}
                <SideBtn icon={Archive} onClick={async () => { await save({ archived: true }, `архивировал(а) «${card.title}»`); onClose(); }}>Архивировать</SideBtn>
                <SideBtn icon={Trash2} onClick={async () => {
                  if (!window.confirm(`Удалить карточку «${card.title}» навсегда? Комментарии и файлы тоже удалятся.`)) return;
                  for (const a of attachments) await deleteAttachment(a);
                  await deleteCard(card.id); logActivity(board.id, `удалил(а) карточку «${card.title}»`); onClose(); onChanged();
                }}>Удалить</SideBtn>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LabelsPicker({ card, board, labels, onLabelsChanged, onChanged }: {
  card: KCard; board: KBoard; labels: KLabel[]; onLabelsChanged: (l: KLabel[]) => void; onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  if (creating) {
    return (
      <div className="space-y-2">
        <Input autoFocus value={name} placeholder="Название метки" onChange={e => setName(e.target.value)} />
        <div className="grid grid-cols-5 gap-1.5">
          {LABEL_COLORS.map(c => (
            <button key={c.key} type="button" title={c.name} onClick={() => setColor(c.key)}
              className={`h-7 rounded ${color === c.key ? 'ring-2 ring-offset-1 ring-primary' : ''}`} style={{ background: c.hex }} />
          ))}
        </div>
        <div className="flex gap-1">
          <Button size="sm" className="flex-1" onClick={async () => {
            const l = await createLabel(board.id, name.trim(), color);
            onLabelsChanged([...labels, l]);
            await toggleCardLabel(card.id, l.id, true); onChanged();
            setCreating(false); setName('');
          }}>Создать</Button>
          <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Отмена</Button>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="text-xs font-semibold text-muted-foreground px-1">Метки</div>
      {labels.map(l => {
        const on = card.label_ids.includes(l.id);
        return (
          <button key={l.id} type="button" className="w-full flex items-center gap-2"
            onClick={async () => { await toggleCardLabel(card.id, l.id, !on); onChanged(); }}>
            <span className={`h-4 w-4 rounded border flex items-center justify-center ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>{on && <Check size={11} />}</span>
            <span className="flex-1 h-8 rounded px-2 text-sm leading-8 font-semibold text-black/75 text-left truncate" style={{ background: labelHex(l.color) }}>{l.name}</span>
          </button>
        );
      })}
      <Button size="sm" variant="secondary" className="w-full" onClick={() => setCreating(true)}><Plus size={13} className="mr-1" />Создать метку</Button>
    </>
  );
}
