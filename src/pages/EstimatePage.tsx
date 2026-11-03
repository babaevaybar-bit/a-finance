import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  loadPrice, PriceIndex, calcEstimate, calcOpening, emptyEstimate, newOpening, itemLabel, money,
  suggestHinges, hasExtraLoad, loadPhotos, modelPhotos, finishBlocks, insertBlocks, categoryOption, finishCategory,
  type InfoBlock, type EstimateData, type Opening, type Item, type Line,
} from '@/lib/price';
import { sizeLimits, limitWarnings, OPEN_KINDS, SIZE_RULES } from '@/lib/sizeRules';
import { hingeSystems, currentSystem, hingeFamilyOf, boxKeyOf, boxItemMatches, orderNotes, BOX_LABEL, type BoxKey } from '@/lib/kit';
import { listEstimates, saveEstimate, deleteEstimate, type EstimateRow } from '@/lib/estimates';
import { openKp } from '@/lib/kp';
import { Info, Calculator, Copy, FileText, FolderOpen, Loader2, Plus, Save, Search, Trash2, X, ChevronDown } from 'lucide-react';

const PICK_GROUPS: { key: string; label: string; sheets: string[] | null }[] = [
  { key: 'box', label: 'Короба', sheets: ['Короба INVISIBLE', 'Короб INVISIBLE 60U', 'Короб SLIM', 'INTEGRAL', 'INTEGRAL Reverse', 'Моноблок ЭМАЛЬ', 'Моноблок REVERSE ЭМАЛЬ', 'Моноблок PE.O, NE.O', 'Моноблок Reverse PE.O, NE.O', 'Моноблок Шпон', 'Моноблок Шпон Reverse'] },
  { key: 'hinge', label: 'Петли', sheets: ['Петли'] },
  { key: 'lock', label: 'Замки', sheets: ['Замки'] },
  { key: 'handle', label: 'Ручки', sheets: ['Дверные ручки', 'Дверные ручки Orange'] },
  { key: 'sys', label: 'Системы открывания', sheets: ['Раздвижные системы открывания', 'Раздвижные системы "MAGIC"', 'Складные системы', 'Поворотные системы', 'Системы "Пенал"'] },
  { key: 'other', label: 'Прочее', sheets: ['Прочая фурнитура', 'Плинтуса алюминиевые', 'Стеновые панели "EGGER"', 'Стеновые панели V', 'Серия "SC" профиля', 'Серия "SC" стекла триплекс', 'Серия "SC" стекла 4 мм'] },
  { key: 'all', label: 'Весь прайс', sheets: null },
];

const selCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function EstimatePage() {
  const { profile } = useAuth();
  const [idx, setIdx] = useState<PriceIndex | null>(null);
  const [est, setEst] = useState<EstimateData>(() => ({ ...emptyEstimate(), openings: [newOpening()] }));
  const [meta, setMeta] = useState({ id: null as string | null, number: null as number | null, client_name: '', client_phone: '', title: '' });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);

  useEffect(() => { loadPrice().then(d => setIdx(new PriceIndex(d))).catch(() => toast.error('Не удалось загрузить прайс')); }, []);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  useEffect(() => { loadPhotos().then(setPhotos); }, []);

  // несохранённые изменения не теряем при случайном закрытии вкладки
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const update = useCallback((fn: (e: EstimateData) => void) => {
    setEst(prev => { const n = clone(prev); fn(n); return n; });
    setDirty(true);
  }, []);
  const updOpening = (id: string, fn: (o: Opening) => void) => update(e => { const o = e.openings.find(x => x.id === id); if (o) { fn(o); syncHinges(o); } });
  /** Петли, добавленные по подсказке, сами пересчитываются по высоте, ширине, числу полотен и опциям */
  function syncHinges(x: Opening) {
    if (!idx) return;
    const sys = currentSystem(x.sheet, x.model, x.openKind === 'book' ? 'book' : x.hingeSys);
    if (!sys || !sys.families.length) return;
    const n = sys.count(x.height, x.width, hasExtraLoad(idx, x)) * Math.max(1, x.leaves || 1);
    for (const l of x.extras) {
      const it = idx.byId.get(l.itemId);
      if (it && l.auto !== false && hingeFamilyOf(it) && sys.families.includes(hingeFamilyOf(it)!)) l.qty = n;
    }
  }

  const totals = useMemo(() => idx ? calcEstimate(idx, est) : null, [idx, est]);

  async function save() {
    if (!idx || !totals) return;
    setSaving(true);
    try {
      const row = await saveEstimate({ id: meta.id, client_name: meta.client_name, client_phone: meta.client_phone, title: meta.title, data: est, total: totals.total, price_title: idx.data.title });
      setMeta(m => ({ ...m, id: row.id, number: row.number }));
      setDirty(false);
      toast.success(`Просчёт №${row.number} сохранён`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally { setSaving(false); }
  }

  function openRow(r: EstimateRow) {
    if (dirty && !window.confirm('Есть несохранённые изменения. Открыть другой просчёт без сохранения?')) return;
    setEst({ ...emptyEstimate(), ...r.data });
    setMeta({ id: r.id, number: r.number, client_name: r.client_name ?? '', client_phone: r.client_phone ?? '', title: r.title ?? '' });
    setDirty(false); setListOpen(false);
  }
  function newEstimate() {
    if (dirty && !window.confirm('Есть несохранённые изменения. Начать новый просчёт?')) return;
    setEst({ ...emptyEstimate(), openings: [newOpening()] }); setMeta({ id: null, number: null, client_name: '', client_phone: '', title: '' }); setDirty(false);
  }
  function copyEstimate() {
    setMeta(m => ({ ...m, id: null, number: null, title: m.title ? `${m.title} (копия)` : 'Копия' }));
    setDirty(true);
    toast.info('Это копия — сохраните, чтобы получить новый номер');
  }

  function addItem(target: { opening: string | null }, it: Item) {
    if (!idx) return;
    update(e => {
      if (target.opening) {
        const o = e.openings.find(x => x.id === target.opening); if (!o) return;
        let qty = 1;
        if (it.sheet === 'Петли') {
          const vv = o.variantId != null ? idx.variant.get(o.variantId) : undefined;
          const sys = currentSystem(o.sheet, vv?.model.code ?? o.model, o.openKind === 'book' ? 'book' : o.hingeSys);
          const fam = hingeFamilyOf(it);
          qty = ((fam && sys?.families.includes(fam) ? sys.count(o.height, o.width, hasExtraLoad(idx, o)) : null) ?? suggestHinges(it.name, o.sheet, vv?.model.code ?? '', o.height, o.width, hasExtraLoad(idx, o)) ?? 2) * Math.max(1, o.leaves || 1);
        }
        o.extras.push({ itemId: it.id, qty, mods: idx.autoMods(it, o.height, o.width, o.leaves || 1, o.openKind || 'swing'), auto: it.sheet === 'Петли' ? true : undefined });
        syncHinges(o);
      } else {
        e.items.push({ itemId: it.id, qty: 1, mods: [] });
      }
    });
    toast.success(`Добавлено: ${it.name}`);
  }

  /** Наценки комплектующих, зависящие от размера и числа полотен (короб для полотна свыше 2400 мм, распашное исполнение короба) — пересчитываем сами */
  function recalcMods(x: Opening) {
    if (!idx) return;
    for (const l of x.extras) {
      const it = idx.byId.get(l.itemId); if (!it) continue;
      const all = idx.modsFor(it).filter(m => m.range || /распашн/i.test(m.name)).map(m => m.id);
      if (!all.length) continue;
      const keep = (l.mods ?? []).filter(id => !all.includes(id));
      l.mods = [...keep, ...idx.autoMods(it, x.height, x.width, x.leaves || 1, x.openKind || 'swing')];
    }
  }
  function setSize(o: Opening, key: 'height' | 'width' | 'leaves' | 'openKind', v: number | string) {
    updOpening(o.id, x => { (x as unknown as Record<string, unknown>)[key] = v; recalcMods(x); });
  }

  if (!idx || !totals) {
    return <AppLayout><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" size={16} />Загружаю прайс…</div></AppLayout>;
  }

  const clientFields = (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <p className="text-sm font-medium">Клиент</p>
      <Input placeholder="Имя клиента" value={meta.client_name} onChange={e => { setMeta(m => ({ ...m, client_name: e.target.value })); setDirty(true); }} />
      <Input placeholder="Телефон" inputMode="tel" value={meta.client_phone} onChange={e => { setMeta(m => ({ ...m, client_phone: e.target.value })); setDirty(true); }} />
      <Input placeholder="Объект (ЖК, квартира…)" value={meta.title} onChange={e => { setMeta(m => ({ ...m, title: e.target.value })); setDirty(true); }} />
    </div>
  );
  const kp = () => {
    if (!openKp(idx, est, photos, { number: meta.number, clientName: meta.client_name, clientPhone: meta.client_phone, managerName: profile?.name && !profile.name.includes('@') ? profile.name : '', date: new Date().toLocaleDateString('ru-RU'), priceTitle: idx.data.title }))
      toast.error('Браузер заблокировал новое окно — разрешите всплывающие окна');
  };
  const addOpening = () => update(e => {
    const last = e.openings[e.openings.length - 1];
    const o = newOpening(last?.sheet ?? '');
    if (last) { o.height = last.height; o.width = last.width; o.profile = last.profile; o.openKind = last.openKind; }
    e.openings.push(o);
  });

  return (
    <AppLayout>
      <div className="space-y-4 pb-24 lg:pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold flex items-center gap-2"><Calculator size={20} />Просчёт{meta.number ? ` №${meta.number}` : ''}{dirty && <span className="text-xs font-normal text-amber-600">не сохранён</span>}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{idx.data.title || 'Прайс PROFILDOORS'} · цены в тенге</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setListOpen(true)}><FolderOpen size={14} className="mr-1.5" />Мои просчёты</Button>
            <Button variant="outline" size="sm" onClick={newEstimate}><Plus size={14} className="mr-1.5" />Новый</Button>
            {meta.id && <Button variant="outline" size="sm" onClick={copyEstimate}><Copy size={14} className="mr-1.5" />Копия</Button>}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
          {/* Левая часть: проёмы и позиции */}
          <div className="space-y-4 min-w-0">
            <div className="lg:hidden">{clientFields}</div>
            {est.openings.map((o, i) => (
              <OpeningCard key={o.id} idx={idx} photos={photos} o={o} n={i + 1}
                onChange={fn => updOpening(o.id, fn)}
                onSize={(k, v) => setSize(o, k, v)}
                onRemove={() => update(e => { e.openings = e.openings.filter(x => x.id !== o.id); })}
                onDuplicate={() => update(e => { const c = clone(o); c.id = newOpening().id; c.room = o.room ? `${o.room} (2)` : ''; e.openings.splice(i + 1, 0, c); })}
                onPick={(group, filter) => setPicker({ target: { opening: o.id }, group, filter })} />
            ))}
            <Button variant="outline" className="w-full h-12 border-dashed" onClick={addOpening}><Plus size={15} className="mr-1.5" />{est.openings.length ? 'Добавить ещё проём' : 'Добавить проём'}</Button>

            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Дополнительно к заказу</p>
                <Button size="sm" variant="outline" onClick={() => setPicker({ target: { opening: null }, group: 'all' })}><Plus size={14} className="mr-1" />Из прайса</Button>
              </div>
              {est.items.length === 0 && <p className="text-xs text-muted-foreground">Плинтус, панели, ручки, фурнитура отдельно — всё, что не относится к конкретному проёму.</p>}
              {est.items.map((l, k) => (
                <LineRow key={k} idx={idx} l={l}
                  onQty={q => update(e => { e.items[k].qty = q; })}
                  onMods={m => update(e => { e.items[k].mods = m; })}
                  onRemove={() => update(e => { e.items.splice(k, 1); })} />
              ))}
            </div>
          </div>

          {/* Правая часть: клиент, итог, действия — всегда на виду */}
          <aside className="space-y-3 lg:sticky lg:top-4">
            <div className="hidden lg:block">{clientFields}</div>
            <div className="rounded-xl border border-border bg-card p-3 text-sm space-y-1.5">
              <p className="text-sm font-medium mb-1">Итог</p>
              {totals.openings.map(({ o, b }, i) => (
                <div key={o.id} className="flex justify-between gap-2 text-xs">
                  <span className="text-muted-foreground truncate">{i + 1}. {o.room || (o.sheet ? `${o.sheet} ${o.model}` : 'Проём')}{o.qty > 1 ? ` ×${o.qty}` : ''}</span>
                  <span className="whitespace-nowrap">{money(b.total)}</span>
                </div>
              ))}
              {totals.items.length > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Дополнительно</span><span>{money(totals.items.reduce((a, x) => a + x.sum, 0))}</span></div>}
              <div className="flex justify-between border-t border-border pt-1.5"><span className="text-muted-foreground">Сумма по прайсу</span><span>{money(totals.sub)}</span></div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted-foreground">Скидка, %</span>
                <Input type="number" inputMode="decimal" min={0} max={100} className="h-8 w-20 text-right" value={est.discountPct || ''} placeholder="0"
                  onChange={e => update(x => { x.discountPct = Math.max(0, Math.min(100, Number(e.target.value) || 0)); })} />
              </div>
              {totals.discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Скидка</span><span>−{money(totals.discount)}</span></div>}
              <div className="flex justify-between text-lg font-semibold border-t border-border pt-1.5"><span>Итого</span><span>{money(totals.total)}</span></div>
            </div>
            <Textarea rows={3} placeholder="Примечание для КП (сроки, монтаж, условия…)" value={est.comment} onChange={e => update(x => { x.comment = e.target.value; })} />
            <div className="hidden lg:grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={kp} disabled={totals.total <= 0}><FileText size={15} className="mr-1.5" />КП</Button>
              <Button onClick={save} disabled={saving || (!dirty && !!meta.id)}>{saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Save size={15} className="mr-1.5" />}Сохранить</Button>
            </div>
          </aside>
        </div>
      </div>

      {/* Телефон/планшет: итог и кнопки закреплены внизу экрана */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{est.openings.length} проём(ов) · итого</p>
            <p className="text-lg font-semibold leading-tight truncate">{money(totals.total)}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-10" onClick={kp} disabled={totals.total <= 0}><FileText size={15} className="mr-1" />КП</Button>
            <Button size="sm" className="h-10" onClick={save} disabled={saving || (!dirty && !!meta.id)}>{saving ? <Loader2 size={15} className="mr-1 animate-spin" /> : <Save size={15} className="mr-1" />}Сохранить</Button>
          </div>
        </div>
      </div>

      <PickerDialog idx={idx} state={picker} onClose={() => setPicker(null)} onPick={it => picker && addItem(picker.target, it)}
        onGroup={g => setPicker(p => p ? { ...p, group: g, filter: undefined } : p)} />
      <ListDialog open={listOpen} onClose={() => setListOpen(false)} onOpen={openRow} currentId={meta.id} />
    </AppLayout>
  );
}

/** Сколько ставить по умолчанию при выборе опции в проёме из нескольких полотен */
function defaultOptQty(it: Item, leaves: number): number {
  if (leaves <= 1) return 1;
  if (/[BВ]["»]?[\s-]*полотн|Притворная планка/i.test(it.name)) return Math.max(1, leaves - 1); // ответные полотна
  if (/Комплектаци|замок|TOUCH|WAVE|Vitra|Krona/i.test(it.name)) return leaves === 2 ? 1 : Math.ceil(leaves / 2); // замок — на активное полотно
  if (/верхняя фрамуга/i.test(it.name)) return 1;
  return leaves;
}

// ─── Проём ───────────────────────────────────────────────────────────────────
function OpeningCard({ idx, photos, o, n, onChange, onSize, onRemove, onDuplicate, onPick }: {
  idx: PriceIndex; photos: Record<string, string>; o: Opening; n: number;
  onChange: (fn: (o: Opening) => void) => void;
  onSize: (k: 'height' | 'width' | 'leaves' | 'openKind', v: number | string) => void;
  onRemove: () => void; onDuplicate: () => void; onPick: (group: string, filter?: PickerState['filter']) => void;
}) {
  const b = calcOpening(idx, o);
  const s = idx.series.get(o.sheet);
  const model = s?.models.find(m => m.code === o.model);
  const groups = s ? [...new Set(s.width.map(m => m.group).filter(Boolean))] : [];
  const options = (s?.options ?? []).map(id => idx.byId.get(id)).filter((x): x is Item => !!x);
  const [showOpts, setShowOpts] = useState(o.options.length > 0);
  const [gridOpen, setGridOpen] = useState(false);
  const wood = /дуб|орех|шпон|карамель|сонома|тобакко/i.test(`${o.finish ?? ''} ${o.color}`);
  const [finishOpen, setFinishOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const variant = model?.variants.find(v => v.id === o.variantId);
  const fBlocks = s ? finishBlocks(s) : [];
  const iBlocks = s && o.model ? insertBlocks(s, o.model, variant?.label ?? '') : [];
  const finType = o.finish ? (fBlocks.flatMap(bl => bl.lists).find(l => l.items.includes(o.finish!))?.type ?? '') : '';
  const finCat = s && o.finish ? finishCategory(s, o.finish) : null;
  const mirror = o.options.some(l => /зеркальн/i.test(idx.byId.get(l.itemId)?.name ?? ''));
  const lim = s ? sizeLimits(s, o, finType, finCat, mirror) : null;
  const sizeWarn = lim ? limitWarnings(lim, o) : [];
  const onlyKinds = s ? (SIZE_RULES[s.sheet]?.models?.[o.model.trim()]?.only) : undefined;
  const kinds = s ? OPEN_KINDS.filter(k => (onlyKinds ? onlyKinds.includes(k.key) : !!SIZE_RULES[s.sheet]?.w[k.key]) || k.key === 'swing') : [];
  const catNow = variant?.label.match(/Категория (\d)/)?.[1];
  /** Выбор покрытия/стекла: сам переключает категорию (вариант цены) или ставит/снимает наценку за категорию */
  const applyFinish = (finish: string, cat: number | null) => onChange(x => {
    x.finish = finish;
    if (!s || cat == null) return;
    const m = s.models.find(mm => mm.code === x.model);
    const v = m?.variants.find(vv => new RegExp(`Категория ${cat}(\\D|$)`).test(vv.label));
    if (v) { x.variantId = v.id; return; }
    const catOpts = [1, 2, 3, 4].map(c => categoryOption(idx, s, c)).filter((it): it is Item => !!it);
    x.options = x.options.filter(l => !catOpts.some(it => it.id === l.itemId));
    const need = cat >= 2 ? categoryOption(idx, s, cat) : null;
    if (need) x.options.push({ itemId: need.id, qty: 1 });
  });
  const pics = o.model ? modelPhotos(photos, o.sheet, o.model, wood) : [];
  const pic = o.photo && pics.some(p => p.url === o.photo) ? { url: o.photo, name: o.photoName ?? '' } : pics[0];
  const chooseModel = (code: string, photo?: { name: string; url: string }) => onChange(x => {
    x.model = code;
    const m = s?.models.find(mm => mm.code === code);
    x.variantId = m && m.variants.length === 1 ? m.variants[0].id : (m?.variants.find(v => v.id === x.variantId)?.id ?? m?.variants[0]?.id ?? null);
    x.photo = photo?.url; x.photoName = photo?.name;
  });
  const chosen = new Map(o.options.map(l => [l.itemId, l]));
  const sections = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of options) { const k = it.section || 'Опции'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(it); }
    return [...m.entries()];
  }, [o.sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center shrink-0">{n}</span>
        <Input className="h-9" placeholder="Помещение (спальня, санузел…)" value={o.room} onChange={e => onChange(x => { x.room = e.target.value; })} />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">×</span>
          <Input type="number" min={1} className="h-9 w-16" value={o.qty} onChange={e => onChange(x => { x.qty = Math.max(1, Number(e.target.value) || 1); })} title="Одинаковых проёмов" />
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Дублировать" onClick={onDuplicate}><Copy size={14} /></Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" title="Удалить проём" onClick={onRemove}><Trash2 size={14} /></Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
      {s && (
        <button type="button" onClick={() => setGridOpen(true)} title="Выбрать модель по фото"
          className="shrink-0 w-full sm:w-[72px] rounded-lg border border-border bg-muted/30 overflow-hidden flex sm:flex-col items-center gap-3 sm:gap-0 text-[11px] sm:text-[10px] text-muted-foreground hover:border-primary">
          {pic ? <img src={pic.url} alt="" referrerPolicy="no-referrer" className="w-12 h-24 sm:w-full sm:h-[150px] object-contain bg-white shrink-0" /> : <span className="h-12 sm:h-[150px] flex items-center px-3 sm:px-1 text-center">Выбрать по фото</span>}
          {pic && <span className="sm:py-0.5 truncate sm:w-full text-left sm:text-center"><span className="sm:hidden block text-sm text-foreground font-medium">{pic.name || o.model}</span><span className="sm:hidden">Нажмите, чтобы выбрать другую модель по фото</span><span className="hidden sm:inline">{pic.name}</span></span>}
        </button>
      )}
      <div className="flex-1 min-w-0 grid gap-2 grid-cols-2 md:grid-cols-6 content-start">
        <label className="col-span-2 md:col-span-2 text-xs text-muted-foreground space-y-1">Серия
          <select className={selCls} value={o.sheet} onChange={e => onChange(x => { x.sheet = e.target.value; x.model = ''; x.variantId = null; x.group = ''; x.options = []; })}>
            <option value="">— выберите —</option>
            {idx.data.series.map(sr => <option key={sr.sheet} value={sr.sheet}>{sr.sheet}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground space-y-1">Модель
          <select className={selCls} value={o.model} disabled={!s} onChange={e => chooseModel(e.target.value)}>
            <option value="">—</option>
            {s?.models.map(m => <option key={m.code} value={m.code}>{m.code}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground space-y-1">Покрытие / вариант
          <select className={selCls} value={o.variantId ?? ''} disabled={!model || model.variants.length < 2}
            onChange={e => onChange(x => { x.variantId = Number(e.target.value) || null; x.finish = undefined; })}>
            {model?.variants.map(v => <option key={v.id} value={v.id}>{v.label || 'стандарт'} — {money(v.price)}</option>)}
            {!model && <option value="">—</option>}
          </select>
        </label>
        <label className="text-xs text-muted-foreground space-y-1">Высота, мм
          <Input type="number" step={50} className="h-9" value={o.height || ''} onChange={e => onSize('height', Number(e.target.value) || 0)} />
        </label>
        <label className="text-xs text-muted-foreground space-y-1">{(o.leaves ?? 1) > 1 ? 'Ширина 1 полотна' : 'Ширина, мм'}
          <Input type="number" step={50} className="h-9" value={o.width || ''} onChange={e => onSize('width', Number(e.target.value) || 0)} />
        </label>
        {s && lim && (
          <div className="col-span-2 md:col-span-6 -mt-1 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="font-medium text-foreground/80">Можно:</span>
              {lim.h && <span>высота <b className="text-foreground">{lim.h[0]}–{lim.h[1]} мм</b></span>}
              {lim.w && <span>ширина <b className="text-foreground">{lim.w[0]}–{lim.w[1]} мм</b></span>}
              {lim.step && <span>{lim.step}</span>}
              <button type="button" className="inline-flex items-center gap-0.5 text-primary hover:underline" onClick={() => setRulesOpen(v => !v)}><Info size={11} />{rulesOpen ? 'скрыть' : 'наценки и правила'}</button>
            </div>
            {rulesOpen && (
              <div className="space-y-0.5 text-foreground/80">
                {lim.notes.map(t => <p key={t}>• {t}</p>)}
                {s.height.filter(m => m.range && (m.group || '') === (o.group || '')).map(m => <p key={m.id}>• {m.name}: +{m.pct}%</p>)}
                {s.width.filter(m => m.range && (m.group || '') === (o.group || '')).map(m => <p key={m.id}>• {m.name}: {m.pct > 0 ? '+' : ''}{m.pct}%</p>)}
              </div>
            )}
            {!rulesOpen && lim.notes.filter(t => !sizeWarn.includes(t)).length > 0 && <p>{lim.notes.filter(t => !sizeWarn.includes(t)).join(' · ')}</p>}
            {sizeWarn.map(w => <p key={w} className="text-amber-700 font-medium">⚠ {w}</p>)}
          </div>
        )}
        {s && (
          <label className="col-span-2 text-xs text-muted-foreground space-y-1">Открывание
            <select className={selCls} value={o.openKind ?? 'swing'} onChange={e => onSize('openKind', e.target.value)}>
              {kinds.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
        )}
        {s && (
          <label className="col-span-2 text-xs text-muted-foreground space-y-1">Полотен в проёме
            <select className={selCls} value={o.leaves ?? 1} onChange={e => onSize('leaves', Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 1 ? '1 — одно полотно' : n === 2 ? '2 — двустворчатая / 2 полотна' : `${n} полотна`}</option>)}
            </select>
            {(o.leaves ?? 1) > 1 && <span className="block text-[11px]">Проём по полотнам ≈ {(o.leaves ?? 1) * (o.width || 0)} мм. Опции — укажите, на сколько полотен.</span>}
          </label>
        )}
        {groups.length > 0 && (
          <label className="col-span-2 text-xs text-muted-foreground space-y-1">Вид полотна
            <select className={selCls} value={o.group} onChange={e => onChange(x => { x.group = e.target.value; })}>
              <option value="">Стандартное полотно</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        )}
        {s && (
          <div className="col-span-2 md:col-span-6 grid gap-2 md:grid-cols-[auto_1fr] items-start">
            <div className="flex flex-wrap gap-2">
              {fBlocks.length > 0 && (
                <button type="button" onClick={() => setFinishOpen(true)}
                  className={`h-9 rounded-md border px-3 text-sm text-left ${o.finish ? 'border-primary bg-primary/5' : 'border-dashed border-border text-muted-foreground'}`}>
                  {o.finish ? <>{/стекл|зеркал|мору|монохром|лак/i.test(o.finish) ? 'Стекло' : 'Покрытие'}: <b>{o.finish}</b></> : (/AG|AT|AGN|AGX/.test(s.sheet) ? 'Выбрать стекло' : 'Выбрать покрытие')}
                </button>
              )}
              {iBlocks.length > 0 && (
                <button type="button" onClick={() => setInsertOpen(true)}
                  className={`h-9 rounded-md border px-3 text-sm ${o.insert ? 'border-primary bg-primary/5' : 'border-dashed border-border text-muted-foreground'}`}>
                  {o.insert ? <>Вставка: <b>{o.insert}</b></> : 'Выбрать вставку'}
                </button>
              )}
            </div>
            <Input className="h-9" placeholder="Доп. к отделке (кромка, сторонность, комментарий для КП)" value={o.color} onChange={e => onChange(x => { x.color = e.target.value; })} />
            {(s.info?.profile.length ?? 0) > 0 && (
              <div className="md:col-span-2 flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-muted-foreground mr-1">Профиль:</span>
                {s.info!.profile.map(c => (
                  <button key={c} type="button" onClick={() => onChange(x => { x.profile = x.profile === c ? undefined : c; })}
                    className={`text-xs rounded-full border px-2.5 py-0.5 ${o.profile === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{c}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
      {s && <ChipsDialog open={finishOpen} onClose={() => setFinishOpen(false)} title={`Серия ${s.sheet}: покрытие / стекло`} blocks={fBlocks} current={o.finish}
        hint={catNow ? `Сейчас выбрана Категория ${catNow}. Выбор из другой категории сам поменяет цену.` : 'Категория 2 и выше — сайт сам добавит наценку за покрытие.'}
        priceFor={b => {
          if (b.cat == null) return '';
          const v = model?.variants.find(vv => new RegExp(`Категория ${b.cat}(\\D|$)`).test(vv.label));
          if (v) return money(v.price);
          const opt = b.cat >= 2 ? categoryOption(idx, s, b.cat) : null;
          return opt ? (opt.kind === 'pct' ? `+${opt.pct}%` : `+${money(opt.price ?? 0)}`) : '';
        }}
        onPick={(item, b) => { applyFinish(item, b.cat); setFinishOpen(false); }} />}
      {s && <ChipsDialog open={insertOpen} onClose={() => setInsertOpen(false)} title="Вставка в полотно" blocks={iBlocks} current={o.insert}
        onPick={item => { onChange(x => { x.insert = item; }); setInsertOpen(false); }} />}
      {s && <ModelGrid open={gridOpen} onClose={() => setGridOpen(false)} sheet={s.sheet} models={s.models.map(m => m.code)} photos={photos} wood={wood}
        current={o.model} onPick={(code, p) => { chooseModel(code, p); setGridOpen(false); }} priceOf={code => s.models.find(m => m.code === code)?.variants[0]?.price ?? 0} />}

      {/* Опции полотна */}
      {s && (
        <div className="rounded-lg bg-muted/30">
          <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-sm" onClick={() => setShowOpts(v => !v)}>
            <span>Опции полотна{o.options.length ? <span className="ml-1.5 text-xs rounded-full bg-primary/10 text-primary px-1.5">{o.options.length}</span> : null}</span>
            <ChevronDown size={15} className={`transition-transform ${showOpts ? '' : '-rotate-90'}`} />
          </button>
          {showOpts && (
            <div className="px-3 pb-3 space-y-3">
              {sections.map(([sec, items]) => (
                <div key={sec}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{sec}</p>
                  <div className="grid gap-1 sm:grid-cols-2 2xl:grid-cols-3">
                    {items.map(it => {
                      const l = chosen.get(it.id);
                      return (
                        <label key={it.id} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer ${l ? 'bg-primary/10' : 'hover:bg-muted/60'}`}>
                          <input type="checkbox" checked={!!l} onChange={e => onChange(x => {
                            if (e.target.checked) x.options.push({ itemId: it.id, qty: defaultOptQty(it, x.leaves || 1) }); else x.options = x.options.filter(y => y.itemId !== it.id);
                          })} />
                          <span className="flex-1 min-w-0">{itemLabel(it)}</span>
                          {l && it.kind === 'price' && (/к-кт|шт|компл/.test(it.unit) || (o.leaves ?? 1) > 1) && (
                            <Input type="number" min={1} className="h-7 w-14 px-1 text-xs" value={l.qty} onClick={e => e.preventDefault()}
                              onChange={e => onChange(x => { const y = x.options.find(z => z.itemId === it.id); if (y) y.qty = Math.max(1, Number(e.target.value) || 1); })} />
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{it.kind === 'pct' ? `${it.pct! > 0 ? '+' : ''}${it.pct}%` : money(it.price ?? 0)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Комплектующие */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm mr-1">Комплектующие:</span>
          {PICK_GROUPS.filter(g => g.key !== 'other').map(g => (
            <Button key={g.key} size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPick(g.key)}><Plus size={12} className="mr-0.5" />{g.label === 'Весь прайс' ? 'Другое' : g.label}</Button>
          ))}
        </div>
        {s && o.model && <KitPanel idx={idx} o={o} onChange={onChange} onPick={onPick} />}
        {o.extras.map((l, k) => {
          const it = idx.byId.get(l.itemId);
          const vv = o.variantId != null ? idx.variant.get(o.variantId) : undefined;
          const sys = currentSystem(o.sheet, vv?.model.code ?? o.model, o.openKind === 'book' ? 'book' : o.hingeSys);
          const fam = it ? hingeFamilyOf(it) : null;
          const per = fam && sys?.families.includes(fam) ? sys.count(o.height, o.width, hasExtraLoad(idx, o)) : null;
          const hint = per != null ? per * Math.max(1, o.leaves || 1) : null;
          return (
            <LineRow key={k} idx={idx} l={l} hint={hint != null && hint !== l.qty ? `по прайсу ${hint} шт` : undefined}
              onQty={q => onChange(x => { x.extras[k].qty = q; x.extras[k].auto = false; })}
              onMods={m => onChange(x => { x.extras[k].mods = m; })}
              onRemove={() => onChange(x => { x.extras.splice(k, 1); })} />
          );
        })}
      </div>

      {/* Расчёт */}
      <div className="rounded-lg border border-border/70 px-3 py-2 text-xs space-y-0.5">
        {b.error && <p className="text-amber-700">{b.error}</p>}
        {o.variantId != null && <>
          <Row l={`Полотно по прайсу${(b.leaves ?? 1) > 1 ? ' (одно)' : ''}`} v={money(b.base)} />
          {b.heightMk && <Row l={`Наценка на высоту ${o.height} мм`} v={`+${b.heightMk.pct}%`} />}
          {b.widthMk && <Row l={`${b.widthMk.pct < 0 ? 'Уценка' : 'Наценка'} на ширину ${o.width} мм`} v={`${b.widthMk.pct > 0 ? '+' : ''}${b.widthMk.pct}%`} />}
          {(b.heightMk || b.widthMk) && <Row l={`Полотно с наценками${(b.leaves ?? 1) > 1 ? ' (одно)' : ''}`} v={money(b.afterSize)} />}
          {(b.leaves ?? 1) > 1 && <Row l={`× ${b.leaves} полотна в проёме`} v={money(b.afterSize * (b.leaves ?? 1))} />}
          {b.pctOptions.map(x => <Row key={x.item.id} l={x.item.name} v={`+${money(x.sum)}`} />)}
          {b.fixedOptions.filter(x => x.sum > 0).map(x => <Row key={x.item.id} l={`${x.item.name}${x.qty > 1 ? ` ×${x.qty}` : ''}`} v={`+${money(x.sum)}`} />)}
          <Row l="Полотно итого" v={money(b.door)} bold />
        </>}
        {b.extrasSum > 0 && <Row l="Комплектующие" v={money(b.extrasSum)} />}
        {b.warnings.map(w => <p key={w} className="text-amber-700">{w}</p>)}
        <div className="flex justify-between pt-1 mt-1 border-t border-border/60 text-sm font-semibold">
          <span>Проём{o.qty > 1 ? ` × ${o.qty}` : ''}</span><span>{money(b.total)}</span>
        </div>
      </div>
      <Input className="h-8 text-xs" placeholder="Заметка к проёму (сторонность, открывание, монтаж…)" value={o.note} onChange={e => onChange(x => { x.note = e.target.value; })} />
    </div>
  );
}

const Row = ({ l, v, bold }: { l: string; v: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-3 ${bold ? 'font-medium text-foreground' : 'text-muted-foreground'}`}><span className="min-w-0">{l}</span><span className="whitespace-nowrap">{v}</span></div>
);

function LineRow({ idx, l, hint, onQty, onMods, onRemove }: { idx: PriceIndex; l: Line; hint?: string; onQty: (q: number) => void; onMods: (m: number[]) => void; onRemove: () => void }) {
  const it = idx.byId.get(l.itemId);
  if (!it) return null;
  const mods = idx.modsFor(it);
  const sum = (it.price ?? 0) * (l.mods ?? []).reduce((a, id) => a * (1 + (idx.byId.get(id)?.pct ?? 0) / 100), 1) * l.qty;
  return (
    <div className="rounded-lg border border-border/70 px-2.5 py-1.5">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <div className="basis-full sm:basis-auto flex-1 min-w-0">
          <p className="text-sm sm:truncate" title={itemLabel(it)}>{itemLabel(it)}</p>
          <p className="text-[11px] text-muted-foreground truncate">{it.sheet}{it.section ? ` · ${it.section}` : ''} · {money(it.price ?? 0)} / {it.unit || 'шт'}{hint && <span className="text-amber-700"> · {hint}</span>}</p>
        </div>
        <Input type="number" min={0} step="any" className="h-8 w-16 px-1.5 text-sm" value={l.qty} onChange={e => onQty(Math.max(0, Number(e.target.value) || 0))} />
        <span className="ml-auto sm:ml-0 w-24 text-right text-sm font-medium whitespace-nowrap">{money(sum)}</span>
        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={onRemove} title="Убрать"><X size={15} /></button>
      </div>
      {mods.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {mods.map(m => {
            const on = (l.mods ?? []).includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => onMods(on ? (l.mods ?? []).filter(x => x !== m.id) : [...(l.mods ?? []), m.id])}
                className={`text-[11px] rounded-full border px-2 py-0.5 ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                {m.name} {m.pct! > 0 ? '+' : ''}{m.pct}%
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Комплектация: петли, короб, замок по правилам прайса ────────────────────
function KitPanel({ idx, o, onChange, onPick }: {
  idx: PriceIndex; o: Opening; onChange: (fn: (o: Opening) => void) => void;
  onPick: (group: string, filter?: PickerState['filter']) => void;
}) {
  const systems = hingeSystems(o.sheet, o.model);
  if (!systems.length) return null;
  const kind = o.openKind ?? 'swing';
  if (kind !== 'swing' && kind !== 'book') return null;   // раздвижные/Pivot/Magic — петли не нужны, система выбирается отдельно
  const sys = currentSystem(o.sheet, o.model, kind === 'book' ? 'book' : o.hingeSys)!;
  const leaves = Math.max(1, o.leaves || 1);
  const per = sys.count(o.height, o.width, hasExtraLoad(idx, o));
  const need = per * leaves;
  const lines = o.extras.map(l => ({ l, it: idx.byId.get(l.itemId) })).filter((x): x is { l: Line; it: Item } => !!x.it);
  const hingeLines = lines.filter(x => hingeFamilyOf(x.it));
  const okHinges = hingeLines.filter(x => sys.families.includes(hingeFamilyOf(x.it)!));
  const badHinges = hingeLines.filter(x => !sys.families.includes(hingeFamilyOf(x.it)!));
  const boxLines = lines.map(x => ({ ...x, key: boxKeyOf(x.it) })).filter(x => x.key);
  const badBoxes = boxLines.filter(x => !sys.boxes.includes(x.key!));
  const hingeItems = idx.data.catalog.filter(it => it.sheet === 'Петли' && it.kind === 'price' && sys.families.includes(hingeFamilyOf(it)!));
  const series = idx.series.get(o.sheet);
  const revOpt = sys.reverse ? series?.options.map(id => idx.byId.get(id)).find(it => it && /^Дверное полотно "?REVERSE"?$/i.test(it.name.trim())) : undefined;
  const hasRev = !!revOpt && o.options.some(l => l.itemId === revOpt.id);
  const notes = orderNotes(idx, o);
  const addHinge = (it: Item) => onChange(x => {
    x.extras = x.extras.filter(l => { const f = hingeFamilyOf(idx.byId.get(l.itemId)!); return !f; });
    x.extras.push({ itemId: it.id, qty: need, auto: true });
  });
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5 space-y-2 text-xs">
      {kind === 'swing' && systems.length > 1 && (
        <label className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Открывание и петли:</span>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={sys.key} onChange={e => onChange(x => { x.hingeSys = e.target.value; })}>
            {systems.filter(x => x.key !== 'book').map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
      )}
      {/* Петли */}
      <div className="space-y-1">
        <p><span className="font-medium">Петли:</span> {sys.included ? <span className="text-emerald-700">{sys.included} — {need} шт.</span> : <>нужно <b>{need} шт.</b>{leaves > 1 ? ` (${per} × ${leaves} полотна)` : ''}{sys.note ? <span className="text-muted-foreground"> · {sys.note}</span> : null}</>}</p>
        {!sys.included && (okHinges.length ? (
          <p className="text-emerald-700">✓ {okHinges.map(x => `${x.it.name.replace('Петля скрытой установки ', '')} — ${x.l.qty} шт.`).join('; ')}{okHinges.some(x => x.l.qty !== need) ? <span className="text-amber-700"> (по прайсу {need})</span> : null}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {hingeItems.map(it => (
              <button key={it.id} type="button" onClick={() => addHinge(it)} className="rounded-full border border-border bg-background px-2 py-0.5 hover:border-primary">
                + {it.name.replace('Петля скрытой установки ', '').replace('Петля ', '')} · {money((it.price ?? 0) * need)}
              </button>
            ))}
          </div>
        ))}
        {badHinges.map(x => <p key={x.it.id} className="text-amber-700">⚠ {x.it.name.replace('Петля скрытой установки ', '')} не подходит к «{sys.label}»</p>)}
      </div>
      {/* Короб */}
      {sys.boxes.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium mr-1">Короб подходит:</span>
            {sys.boxes.map(b => (
              <button key={b} type="button" onClick={() => onPick('box', { box: b, series: o.sheet })}
                className={`rounded-full border px-2 py-0.5 ${boxLines.some(x => x.key === b) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary'}`}>{BOX_LABEL[b]}</button>
            ))}
          </div>
          {badBoxes.map(x => <p key={x.it.id} className="text-amber-700">⚠ Короб {BOX_LABEL[x.key!]} не подходит к «{sys.label}» — нужен: {sys.boxes.map(b => BOX_LABEL[b]).join(', ')}</p>)}
        </div>
      )}
      {sys.reverse && revOpt && !hasRev && (
        <p className="text-amber-700">⚠ Открывание от себя — нужно полотно REVERSE.{' '}
          <button type="button" className="underline text-primary" onClick={() => onChange(x => { x.options.push({ itemId: revOpt.id, qty: Math.max(1, x.leaves || 1) }); })}>Добавить (+{money((revOpt.price ?? 0) * leaves)})</button></p>
      )}
      {notes.map(nt => (
        <p key={nt.text} className="text-foreground/80">• {nt.text}{nt.addIds && <> {' '}<button type="button" className="underline text-primary" onClick={() => onChange(x => { for (const id of nt.addIds!) x.extras.push({ itemId: id, qty: 1 }); })}>добавить</button></>}</p>
      ))}
    </div>
  );
}

// ─── Выбор покрытия / стекла / вставки ───────────────────────────────────────
function ChipsDialog({ open, onClose, title, blocks, current, hint, priceFor, onPick }: {
  open: boolean; onClose: () => void; title: string; blocks: InfoBlock[]; current?: string; hint?: string;
  priceFor?: (b: InfoBlock) => string; onPick: (item: string, b: InfoBlock) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {hint && <p className="text-xs text-muted-foreground -mt-2">{hint}</p>}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {blocks.map(b => {
            const pr = priceFor?.(b);
            return (
              <div key={b.title}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <p className="text-sm font-semibold">{b.title.replace(/^Серия \S+ · /, '') || 'Варианты'}</p>
                  {pr && <span className="text-xs text-muted-foreground whitespace-nowrap">{pr}</span>}
                </div>
                <div className="space-y-2">
                  {b.lists.map(l => (
                    <div key={l.type}>
                      {(b.lists.length > 1 || !/^(Цвета|Варианты)$/.test(l.type)) && <p className="text-[11px] text-muted-foreground mb-1">{l.type}</p>}
                      <div className="flex flex-wrap gap-1">
                        {l.items.map(it => (
                          <button key={it} type="button" onClick={() => onPick(it, b)}
                            className={`text-xs rounded-full border px-2.5 py-1 ${current === it ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{it}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Выбор модели по фото ────────────────────────────────────────────────────
function ModelGrid({ open, onClose, sheet, models, photos, wood, current, onPick, priceOf }: {
  open: boolean; onClose: () => void; sheet: string; models: string[]; photos: Record<string, string>; wood: boolean;
  current: string; onPick: (code: string, p?: { name: string; url: string }) => void; priceOf: (code: string) => number;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Серия {sheet} — выберите модель</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2 p-0.5">
          {models.flatMap(code => {
            const ps = modelPhotos(photos, sheet, code, wood);
            const list = ps.length ? ps : [undefined];
            return list.map((p, k) => (
              <button key={code + k} type="button" onClick={() => onPick(code, p)}
                className={`rounded-lg border p-1 flex flex-col items-center gap-1 hover:border-primary ${current === code ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                {p ? <img src={p.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-36 w-full object-contain bg-white rounded" />
                  : <span className="h-36 w-full flex items-center justify-center text-[11px] text-muted-foreground bg-muted/40 rounded">нет фото</span>}
                <span className="text-xs font-medium leading-tight text-center">{p?.name || code}</span>
                <span className="text-[10px] text-muted-foreground">от {money(priceOf(code))}</span>
              </button>
            ));
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Фото с сайта profildoors.ru. Цвет на фото может отличаться от выбранного.</p>
      </DialogContent>
    </Dialog>
  );
}

// ─── Выбор позиции из прайса ─────────────────────────────────────────────────
interface PickerState { target: { opening: string | null }; group: string; filter?: { box: BoxKey; series: string } }

function PickerDialog({ idx, state, onClose, onPick, onGroup }: {
  idx: PriceIndex; state: PickerState | null; onClose: () => void; onPick: (it: Item) => void; onGroup: (g: string) => void;
}) {
  const filter = state?.filter;
  const [q, setQ] = useState('');
  useEffect(() => { if (state) setQ(''); }, [state?.group]); // eslint-disable-line react-hooks/exhaustive-deps
  const group = PICK_GROUPS.find(g => g.key === state?.group) ?? PICK_GROUPS[PICK_GROUPS.length - 1];
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return idx.data.catalog.filter(it => it.kind === 'price'
      && (filter ? boxItemMatches(it, filter.box, filter.series) : (!group.sheets || group.sheets.includes(it.sheet)))
      && words.every(w => `${itemLabel(it)} ${it.sheet} ${it.section} ${it.sub}`.toLowerCase().includes(w)));
  }, [idx, group, q, filter]);
  const bySheet = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of list.slice(0, 400)) { const k = `${it.sheet}${it.section ? ' · ' + it.section : ''}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(it); }
    return [...m.entries()];
  }, [list]);
  return (
    <Dialog open={!!state} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>{filter ? `Короб ${BOX_LABEL[filter.box]} — что добавить` : 'Добавить из прайса'}</DialogTitle></DialogHeader>
        {filter && <p className="text-xs text-muted-foreground -mt-2">Показаны только позиции этого короба (сам короб, наличники, доборы). Другие — во вкладках ниже.</p>}
        <div className="flex flex-wrap gap-1">
          {PICK_GROUPS.map(g => (
            <button key={g.key} type="button" onClick={() => onGroup(g.key)}
              className={`text-xs rounded-full border px-2.5 py-1 ${g.key === group.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{g.label}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="pl-8" placeholder="Поиск: invisible, eclipse, touch, ручка sly…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-3">
          {bySheet.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Ничего не найдено</p>}
          {bySheet.map(([k, items]) => (
            <div key={k}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 sticky top-0 bg-background py-0.5">{k}</p>
              {items.map(it => (
                <button key={it.id} type="button" onClick={() => onPick(it)}
                  className="w-full flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <span className="min-w-0">{itemLabel(it)}{it.sub && <span className="block text-[11px] text-muted-foreground truncate">{it.sub}</span>}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{money(it.price ?? 0)} / {it.unit || 'шт'}</span>
                </button>
              ))}
            </div>
          ))}
          {list.length > 400 && <p className="text-xs text-muted-foreground text-center">Показаны первые 400 — уточните поиск</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Список сохранённых просчётов ────────────────────────────────────────────
function ListDialog({ open, onClose, onOpen, currentId }: { open: boolean; onClose: () => void; onOpen: (r: EstimateRow) => void; currentId: string | null }) {
  const [rows, setRows] = useState<EstimateRow[] | null>(null);
  const [q, setQ] = useState('');
  const load = () => listEstimates().then(setRows).catch(() => { setRows([]); toast.error('Не удалось загрузить просчёты'); });
  useEffect(() => { if (open) { setRows(null); load(); } }, [open]);
  const shown = (rows ?? []).filter(r => !q.trim() || `${r.number} ${r.client_name ?? ''} ${r.client_phone ?? ''} ${r.title ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Мои просчёты</DialogTitle></DialogHeader>
        <Input placeholder="Поиск по клиенту, телефону, номеру" value={q} onChange={e => setQ(e.target.value)} />
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {rows === null ? <p className="text-sm text-muted-foreground py-4 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Загрузка…</p>
            : shown.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Пока нет сохранённых просчётов</p>
            : shown.map(r => (
              <div key={r.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${r.id === currentId ? 'border-primary' : 'border-border'}`}>
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onOpen(r)}>
                  <p className="text-sm font-medium truncate">№{r.number} · {r.client_name || 'Без имени'}{r.title ? ` · ${r.title}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString('ru-RU')} · {(r.data?.openings?.length ?? 0)} проём(ов) · {money(Number(r.total))}</p>
                </button>
                <button type="button" className="text-muted-foreground hover:text-destructive" title="Удалить" onClick={async () => {
                  if (!window.confirm(`Удалить просчёт №${r.number}?`)) return;
                  try { await deleteEstimate(r.id); toast.success('Удалён'); load(); } catch { toast.error('Не удалось удалить'); }
                }}><Trash2 size={14} /></button>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
