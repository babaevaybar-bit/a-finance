import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Zap, X, ArrowRight } from 'lucide-react';
import type { Manager } from '@/types/types';
import {
  getAutomations, saveAutomation, deleteAutomation, createField, updateField, deleteField,
  getObservers, setObserver, getProfiles, LABEL_COLORS, labelHex, FIELD_TYPE_LABELS,
  type KAutomation, type KTrigger, type KAction, type KList, type KLabel, type KCustomField, type KFieldType,
} from '@/lib/kanban';

const sel = 'h-8 rounded-md border border-input bg-background px-2 text-sm w-full';

// ═══ Автоматизация ═══
function describeTrigger(t: KTrigger, lists: KList[], labels: KLabel[], managers: Manager[]): string {
  switch (t.type) {
    case 'moved_to_list': return `Карточку перенесли в «${lists.find(l => l.id === t.list_id)?.title ?? '?'}»`;
    case 'card_created': return t.list_id ? `Карточку создали в «${lists.find(l => l.id === t.list_id)?.title ?? '?'}»` : 'Создали любую карточку';
    case 'checklist_done': return 'Все пункты чек-листа выполнены';
    case 'due_done': return 'Срок отмечен выполненным';
    case 'label_added': return `Добавили метку «${labels.find(l => l.id === t.label_id)?.name ?? '?'}»`;
    case 'member_added': return `Добавили участника ${managers.find(m => m.id === t.manager_id)?.name ?? '?'}`;
  }
}
function describeAction(a: KAction, lists: KList[], labels: KLabel[], managers: Manager[]): string {
  switch (a.type) {
    case 'add_member': return `добавить ${managers.find(m => m.id === a.manager_id)?.name ?? '?'}`;
    case 'remove_members': return 'убрать всех участников';
    case 'add_label': return `поставить метку «${labels.find(l => l.id === a.label_id)?.name ?? '?'}»`;
    case 'remove_label': return `снять метку «${labels.find(l => l.id === a.label_id)?.name ?? '?'}»`;
    case 'set_due': return `срок через ${a.days} дн.`;
    case 'clear_due': return 'убрать срок';
    case 'mark_due_done': return 'отметить срок выполненным';
    case 'move_to_list': return `перенести в «${lists.find(l => l.id === a.list_id)?.title ?? '?'}»`;
    case 'set_cover': return a.color ? 'поставить обложку' : 'убрать обложку';
    case 'add_checklist': return `добавить чек-лист «${a.title}» (${a.items.length} п.)`;
    case 'comment': return `написать комментарий «${a.text.slice(0, 30)}»`;
    case 'archive': return 'архивировать карточку';
  }
}

const RULE_TEMPLATES: { name: string; build: (lists: KList[]) => Pick<KAutomation, 'name' | 'trigger' | 'actions'> | null }[] = [
  {
    name: 'В «Монтаж» — срок через 3 дня',
    build: lists => { const l = lists.find(x => /монтаж/i.test(x.title)); return l ? { name: 'Монтаж: срок 3 дня', trigger: { type: 'moved_to_list', list_id: l.id }, actions: [{ type: 'set_due', days: 3 }] } : null; },
  },
  {
    name: 'В «Завершено» — отметить выполненным',
    build: lists => { const l = lists.find(x => /заверш|готово/i.test(x.title)); return l ? { name: 'Завершено: срок выполнен', trigger: { type: 'moved_to_list', list_id: l.id }, actions: [{ type: 'mark_due_done' }] } : null; },
  },
  {
    name: 'В «Замер» — чек-лист замера',
    build: lists => { const l = lists.find(x => /замер/i.test(x.title)); return l ? { name: 'Замер: чек-лист', trigger: { type: 'moved_to_list', list_id: l.id }, actions: [{ type: 'add_checklist', title: 'Замер', items: ['Созвониться с клиентом', 'Выехать на замер', 'Сделать фото проёмов', 'Заполнить лист замера'] }] } : null; },
  },
];

export function AutomationPanel({ boardId, lists, labels, managers }: { boardId: string; lists: KList[]; labels: KLabel[]; managers: Manager[] }) {
  const [rules, setRules] = useState<KAutomation[]>([]);
  const [editing, setEditing] = useState<Partial<KAutomation> | null>(null);
  const load = () => getAutomations(boardId).then(setRules);
  useEffect(() => { load(); }, [boardId]);

  async function addTemplate(t: typeof RULE_TEMPLATES[number]) {
    const r = t.build(lists);
    if (!r) { toast.error('На доске нет подходящей колонки для этого шаблона'); return; }
    await saveAutomation({ ...r, board_id: boardId }); load(); toast.success('Правило добавлено');
  }

  if (editing) return <RuleEditor boardId={boardId} rule={editing} lists={lists} labels={labels} managers={managers}
    onDone={() => { setEditing(null); load(); }} />;

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">Правила работают сами: «когда случилось X — сделать Y». Без ограничений по количеству запусков.</p>
      <Button className="w-full" onClick={() => setEditing({ name: '', trigger: { type: 'moved_to_list', list_id: lists[0]?.id ?? '' }, actions: [], enabled: true })}>
        <Plus size={14} className="mr-1.5" />Новое правило
      </Button>
      {rules.length === 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-muted-foreground">Готовые правила</div>
          {RULE_TEMPLATES.map(t => (
            <button key={t.name} type="button" onClick={() => addTemplate(t)} className="w-full text-left text-sm rounded-lg border border-dashed border-border px-3 py-2 hover:bg-muted/50">
              <Zap size={12} className="inline mr-1.5 text-amber-500" />{t.name}
            </button>
          ))}
        </div>
      )}
      {rules.map(r => (
        <div key={r.id} className={`rounded-lg border border-border p-3 space-y-1.5 ${r.enabled ? '' : 'opacity-60'}`}>
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-amber-500 shrink-0" />
            <span className="font-medium text-sm flex-1 truncate">{r.name || 'Без названия'}</span>
            <Switch checked={r.enabled} onCheckedChange={async v => { await saveAutomation({ ...r, enabled: v }); load(); }} />
          </div>
          <div className="text-xs"><span className="text-muted-foreground">Когда:</span> {describeTrigger(r.trigger, lists, labels, managers)}</div>
          <div className="text-xs"><span className="text-muted-foreground">Сделать:</span> {r.actions.map(a => describeAction(a, lists, labels, managers)).join(', ') || '—'}</div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground flex-1">Сработало: {r.runs}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(r)}>Изменить</Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Удалить правило"
              onClick={async () => { if (!window.confirm('Удалить правило?')) return; await deleteAutomation(r.id); load(); }}><Trash2 size={13} /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RuleEditor({ boardId, rule, lists, labels, managers, onDone }: {
  boardId: string; rule: Partial<KAutomation>; lists: KList[]; labels: KLabel[]; managers: Manager[]; onDone: () => void;
}) {
  const [name, setName] = useState(rule.name ?? '');
  const [trigger, setTrigger] = useState<KTrigger>(rule.trigger ?? { type: 'moved_to_list', list_id: lists[0]?.id ?? '' });
  const [actions, setActions] = useState<KAction[]>(rule.actions ?? []);
  const [newType, setNewType] = useState<KAction['type']>('add_member');

  function defaultAction(t: KAction['type']): KAction {
    switch (t) {
      case 'add_member': return { type: t, manager_id: managers[0]?.id ?? '' };
      case 'add_label': case 'remove_label': return { type: t, label_id: labels[0]?.id ?? '' };
      case 'set_due': return { type: t, days: 3 };
      case 'move_to_list': return { type: t, list_id: lists[0]?.id ?? '' };
      case 'set_cover': return { type: t, color: 'green' };
      case 'add_checklist': return { type: t, title: 'Чек-лист', items: [''] };
      case 'comment': return { type: t, text: '' };
      default: return { type: t } as KAction;
    }
  }
  const upd = (i: number, a: KAction) => setActions(p => p.map((x, j) => j === i ? a : x));

  return (
    <div className="mt-4 space-y-4">
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Название правила, например «Монтаж: назначить Бекхана»" />
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-muted-foreground">Когда</div>
        <select className={sel} value={trigger.type} onChange={e => {
          const t = e.target.value as KTrigger['type'];
          setTrigger(t === 'moved_to_list' ? { type: t, list_id: lists[0]?.id ?? '' } : t === 'card_created' ? { type: t, list_id: null }
            : t === 'label_added' ? { type: t, label_id: labels[0]?.id ?? '' } : t === 'member_added' ? { type: t, manager_id: managers[0]?.id ?? '' } : { type: t } as KTrigger);
        }}>
          <option value="moved_to_list">Карточку перенесли в колонку</option>
          <option value="card_created">Карточку создали</option>
          <option value="checklist_done">Все пункты чек-листа выполнены</option>
          <option value="due_done">Срок отмечен выполненным</option>
          <option value="label_added">Добавили метку</option>
          <option value="member_added">Добавили участника</option>
        </select>
        {trigger.type === 'moved_to_list' && (
          <select className={sel} value={trigger.list_id} onChange={e => setTrigger({ type: 'moved_to_list', list_id: e.target.value })}>
            {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        )}
        {trigger.type === 'card_created' && (
          <select className={sel} value={trigger.list_id ?? ''} onChange={e => setTrigger({ type: 'card_created', list_id: e.target.value || null })}>
            <option value="">в любой колонке</option>
            {lists.map(l => <option key={l.id} value={l.id}>в «{l.title}»</option>)}
          </select>
        )}
        {trigger.type === 'label_added' && (
          <select className={sel} value={trigger.label_id} onChange={e => setTrigger({ type: 'label_added', label_id: e.target.value })}>
            {labels.map(l => <option key={l.id} value={l.id}>{l.name || l.color}</option>)}
          </select>
        )}
        {trigger.type === 'member_added' && (
          <select className={sel} value={trigger.manager_id} onChange={e => setTrigger({ type: 'member_added', manager_id: e.target.value })}>
            {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><ArrowRight size={12} />Сделать</div>
        {actions.map((a, i) => (
          <div key={i} className="rounded-lg border border-border p-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>{describeAction(a, lists, labels, managers)}</span>
              <button type="button" onClick={() => setActions(p => p.filter((_, j) => j !== i))} aria-label="Убрать действие"><X size={14} /></button>
            </div>
            {a.type === 'add_member' && (
              <select className={sel} value={a.manager_id} onChange={e => upd(i, { ...a, manager_id: e.target.value })}>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            )}
            {(a.type === 'add_label' || a.type === 'remove_label') && (
              <select className={sel} value={a.label_id} onChange={e => upd(i, { ...a, label_id: e.target.value })}>{labels.map(l => <option key={l.id} value={l.id}>{l.name || l.color}</option>)}</select>
            )}
            {a.type === 'set_due' && (
              <div className="flex items-center gap-2 text-sm">через <Input type="number" min={0} className="h-8 w-20" value={a.days} onChange={e => upd(i, { ...a, days: Number(e.target.value) })} /> дн.</div>
            )}
            {a.type === 'move_to_list' && (
              <select className={sel} value={a.list_id} onChange={e => upd(i, { ...a, list_id: e.target.value })}>{lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select>
            )}
            {a.type === 'set_cover' && (
              <div className="flex flex-wrap gap-1">
                {LABEL_COLORS.map(c => <button key={c.key} type="button" onClick={() => upd(i, { ...a, color: c.key })} className={`h-6 w-8 rounded ${a.color === c.key ? 'ring-2 ring-primary ring-offset-1' : ''}`} style={{ background: c.hex }} />)}
                <button type="button" className="text-xs px-2" onClick={() => upd(i, { ...a, color: null })}>без обложки</button>
              </div>
            )}
            {a.type === 'add_checklist' && (
              <div className="space-y-1">
                <Input className="h-8" value={a.title} onChange={e => upd(i, { ...a, title: e.target.value })} placeholder="Название чек-листа" />
                {a.items.map((it, k) => (
                  <Input key={k} className="h-8" value={it} placeholder={`Пункт ${k + 1}`}
                    onChange={e => upd(i, { ...a, items: a.items.map((x, j) => j === k ? e.target.value : x) })} />
                ))}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => upd(i, { ...a, items: [...a.items, ''] })}><Plus size={12} className="mr-1" />пункт</Button>
              </div>
            )}
            {a.type === 'comment' && <Input className="h-8" value={a.text} onChange={e => upd(i, { ...a, text: e.target.value })} placeholder="Текст комментария" />}
          </div>
        ))}
        <div className="flex gap-1.5">
          <select className={sel} value={newType} onChange={e => setNewType(e.target.value as KAction['type'])}>
            <option value="add_member">Добавить участника</option>
            <option value="remove_members">Убрать всех участников</option>
            <option value="add_label">Поставить метку</option>
            <option value="remove_label">Снять метку</option>
            <option value="set_due">Поставить срок через N дней</option>
            <option value="clear_due">Убрать срок</option>
            <option value="mark_due_done">Отметить срок выполненным</option>
            <option value="move_to_list">Перенести в колонку</option>
            <option value="set_cover">Обложка</option>
            <option value="add_checklist">Добавить чек-лист</option>
            <option value="comment">Написать комментарий</option>
            <option value="archive">Архивировать</option>
          </select>
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setActions(p => [...p, defaultAction(newType)])}><Plus size={13} /></Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" disabled={actions.length === 0} onClick={async () => {
          try { await saveAutomation({ id: rule.id, board_id: boardId, name: name.trim(), trigger, actions, enabled: rule.enabled ?? true }); toast.success('Правило сохранено'); onDone(); }
          catch { toast.error('Не удалось сохранить'); }
        }}>Сохранить</Button>
        <Button variant="outline" onClick={onDone}>Отмена</Button>
      </div>
    </div>
  );
}

// ═══ Свои поля ═══
export function FieldsPanel({ boardId, fields, onChange }: { boardId: string; fields: KCustomField[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<KFieldType>('text');
  const [options, setOptions] = useState<string[]>(['']);
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">Дополнительные поля в каждой карточке этой доски: например «Кол-во дверей», «Монтажник», «Сумма».</p>
      {fields.map(f => (
        <div key={f.id} className="rounded-lg border border-border p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <input defaultValue={f.name} className="flex-1 text-sm font-medium bg-transparent outline-none rounded px-1 focus:bg-muted"
              onBlur={async e => { if (e.target.value.trim() && e.target.value !== f.name) { await updateField(f.id, { name: e.target.value.trim() }); onChange(); } }} />
            <span className="text-[11px] text-muted-foreground">{FIELD_TYPE_LABELS[f.type]}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Удалить поле"
              onClick={async () => { if (!window.confirm(`Удалить поле «${f.name}» и его значения во всех карточках?`)) return; await deleteField(f.id); onChange(); }}><Trash2 size={13} /></Button>
          </div>
          {f.type === 'select' && (
            <div className="flex flex-wrap gap-1">{f.options.map(o => <span key={o.id} className="text-[11px] rounded px-1.5 py-0.5 font-medium text-black/75" style={{ background: labelHex(o.color) }}>{o.name}</span>)}</div>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={f.show_on_card} onCheckedChange={async v => { await updateField(f.id, { show_on_card: v }); onChange(); }} />
            Показывать на мини-карточке
          </label>
        </div>
      ))}
      <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground">Новое поле</div>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Название поля" />
        <select className={sel} value={type} onChange={e => setType(e.target.value as KFieldType)}>
          {(Object.keys(FIELD_TYPE_LABELS) as KFieldType[]).map(t => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
        </select>
        {type === 'select' && (
          <div className="space-y-1">
            {options.map((o, i) => (
              <Input key={i} className="h-8" value={o} placeholder={`Вариант ${i + 1}`} onChange={e => setOptions(p => p.map((x, j) => j === i ? e.target.value : x))} />
            ))}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOptions(p => [...p, ''])}><Plus size={12} className="mr-1" />вариант</Button>
          </div>
        )}
        <Button className="w-full" disabled={!name.trim() || (type === 'select' && !options.some(o => o.trim()))} onClick={async () => {
          const opts = type === 'select' ? options.filter(o => o.trim()).map((o, i) => ({ id: crypto.randomUUID(), name: o.trim(), color: LABEL_COLORS[i % LABEL_COLORS.length].key })) : [];
          await createField(boardId, { name: name.trim(), type, options: opts, show_on_card: true }, (fields.length + 1) * 1024);
          setName(''); setOptions(['']); onChange();
        }}>Добавить поле</Button>
        <div className="text-[11px] text-muted-foreground">Идеи: «Кол-во дверей» (число), «Монтажник» (список), «Дата замера» (дата), «Оплачено полностью» (галочка).</div>
      </div>
    </div>
  );
}

// ═══ Наблюдатели ═══
export function ObserversPanel({ boardId }: { boardId: string }) {
  const [profiles, setProfiles] = useState<{ id: string; name: string; role: string }[]>([]);
  const [obs, setObs] = useState<string[]>([]);
  useEffect(() => { getProfiles().then(setProfiles); getObservers(boardId).then(setObs); }, [boardId]);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">Наблюдатель видит доску, но не может переносить, создавать и менять колонки и карточки. Главный админ всегда может всё.</p>
      {profiles.filter(p => p.role !== 'director').map(p => (
        <label key={p.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
          <span className="flex-1 truncate">{p.name}</span>
          <span className="text-xs text-muted-foreground">только просмотр</span>
          <Switch checked={obs.includes(p.id)} onCheckedChange={async v => { await setObserver(boardId, p.id, v); setObs(prev => v ? [...prev, p.id] : prev.filter(x => x !== p.id)); }} />
        </label>
      ))}
      {profiles.filter(p => p.role !== 'director').length === 0 && <p className="text-sm text-muted-foreground">Нет сотрудников со своим входом.</p>}
    </div>
  );
}
