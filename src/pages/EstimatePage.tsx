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
  suggestHinges, hasExtraLoad, loadPhotos, modelPhotos, loadColors, modelColorPhoto, modelDefaultPhoto, swatchFor, loadHandlePhotos, isBLeafItem, catOfItem, CAT_LABEL, HARDWARE, type Cat, type HandlePhotos, type ColorData, leafOf, leavesWidth, type LeafCfg, finishBlocks, insertBlocks, categoryOption, finishCategory,
  type InfoBlock, type EstimateData, type Opening, type Item, type Line,
} from '@/lib/price';
import { sizeLimits, limitWarnings, heightStep, OPEN_KINDS, SIZE_RULES } from '@/lib/sizeRules';
import { hingeSystems, currentSystem, hingeFamilyOf, boxKeyOf, boxItemMatches, orderNotes, fitsOpening, emptyReason, BOX_LABEL, ORANGE, type BoxKey, type PickCtx, type HingeSys } from '@/lib/kit';
import { listEstimates, saveEstimate, deleteEstimate, getEstimate, type EstimateRow } from '@/lib/estimates';
import { useSearchParams } from 'react-router-dom';
import { openKp } from '@/lib/kp';
import ClientHistoryButton from '@/components/client/ClientHistoryButton';
import { sideOf, syncLeafSurcharges, hingesNeeded } from '@/lib/leaves';
import { Info, Calculator, Copy, FileText, FolderOpen, Loader2, Plus, Save, Search, Trash2, X, ChevronDown } from 'lucide-react';

const PICK_GROUPS: { key: string; label: string; sheets: string[] | null }[] = [
  { key: 'box', label: 'Короба', sheets: ['Короба INVISIBLE', 'Короб INVISIBLE 60U', 'Короб SLIM', 'INTEGRAL', 'INTEGRAL Reverse', 'Моноблок ЭМАЛЬ', 'Моноблок REVERSE ЭМАЛЬ', 'Моноблок PE.O, NE.O', 'Моноблок Reverse PE.O, NE.O', 'Моноблок Шпон', 'Моноблок Шпон Reverse'] },
  { key: 'hinge', label: 'Петли', sheets: ['Петли'] },
  { key: 'lock', label: 'Замки', sheets: ['Замки'] },
  { key: 'handle', label: 'Ручки', sheets: ['Дверные ручки', 'Дверные ручки Orange'] },
  { key: 'sys', label: 'Системы открывания', sheets: ['Раздвижные системы открывания', 'Раздвижные системы "MAGIC"', 'Складные системы', 'Поворотные системы', 'Системы "Пенал"'] },
  { key: 'fitting', label: 'Прочая фурнитура', sheets: ['Прочая фурнитура'] },
  { key: 'other', label: 'Прочее', sheets: ['Плинтуса алюминиевые', 'Стеновые панели "EGGER"', 'Стеновые панели V', 'Серия "SC" профиля', 'Серия "SC" стекла триплекс', 'Серия "SC" стекла 4 мм'] },
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
  const [colors, setColors] = useState<ColorData | null>(null);
  useEffect(() => { loadColors().then(setColors); }, []);
  const [handlePhotos, setHandlePhotos] = useState<HandlePhotos>({});
  useEffect(() => { loadHandlePhotos().then(setHandlePhotos); }, []);

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
  const updOpening = (id: string, fn: (o: Opening) => void) => update(e => { const o = e.openings.find(x => x.id === id); if (o) { fn(o); if (idx) syncLeafSurcharges(idx, o); syncHinges(o); } });
  /** Категория покрытия полотна (для наценки на погонаж «Категория 2 и 3») */
  function catOf(x: Opening): number | null {
    const s = idx?.series.get(x.sheet);
    return s && x.finish ? finishCategory(s, x.finish) : null;
  }
  /** Петли, добавленные по подсказке, сами пересчитываются по высоте, ширине, числу полотен и опциям; наценка на погонаж — по покрытию */
  function syncHinges(x: Opening) {
    if (!idx) return;
    const doorCat = catOf(x);
    for (const l of x.extras) {
      const it = idx.byId.get(l.itemId); if (!it) continue;
      const catMods = idx.modsFor(it).filter(m => /погонаж/i.test(m.name) && /категори/i.test(m.name)).map(m => m.id);
      if (!catMods.length) continue;
      // цвет погонажа: свой у строки (короб в перламутре) или как у двери
      const ls = idx.series.get(it.sheet) ?? idx.series.get(x.sheet);
      const cat = l.color && ls ? finishCategory(ls, l.color) : doorCat;
      const want = idx.autoMods(it, x.height, x.width, x.leaves || 1, x.openKind || 'swing', cat).filter(id => catMods.includes(id));
      l.mods = [...(l.mods ?? []).filter(id => !catMods.includes(id)), ...want];
    }
    const sys = currentSystem(x.sheet, x.model, x.openKind === 'book' ? 'book' : x.hingeSys);
    if (!sys || !sys.families.length) return;
    const n = hingesNeeded(sys, x, hasExtraLoad(idx, x)).total;
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
  // ?id=… — открыть сохранённый просчёт (например, из карточки клиента)
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get('id');
    if (!id) return;
    getEstimate(id).then(r => { if (r) openRow(r); else toast.error('Просчёт не найден'); }).catch(() => toast.error('Не удалось открыть просчёт'))
      .finally(() => setParams(p => { p.delete('id'); return p; }, { replace: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
          qty = (fam && sys?.families.includes(fam) ? hingesNeeded(sys, o, hasExtraLoad(idx, o)).total : null) ?? (suggestHinges(it.name, o.sheet, vv?.model.code ?? '', o.height, o.width, hasExtraLoad(idx, o)) ?? 2) * Math.max(1, o.leaves || 1);
        }
        if (HARDWARE.includes(catOfItem(it))) o.hardware = true;
        o.extras.push({ itemId: it.id, qty, mods: idx.autoMods(it, o.height, o.width, o.leaves || 1, o.openKind || 'swing', catOf(o)), auto: it.sheet === 'Петли' ? true : undefined });
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
      l.mods = [...keep, ...idx.autoMods(it, x.height, x.width, x.leaves || 1, x.openKind || 'swing', catOf(x))];
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
      <ClientHistoryButton phone={meta.client_phone} name={meta.client_name} label />
      <Input placeholder="Объект (ЖК, квартира…)" value={meta.title} onChange={e => { setMeta(m => ({ ...m, title: e.target.value })); setDirty(true); }} />
    </div>
  );
  const kp = () => {
    if (!openKp(idx, est, photos, colors, { number: meta.number, clientName: meta.client_name, clientPhone: meta.client_phone, managerName: profile?.name && !profile.name.includes('@') ? profile.name : '', date: new Date().toLocaleDateString('ru-RU'), priceTitle: idx.data.title }, handlePhotos))
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
            <h1 className="text-xl font-semibold flex items-center gap-2"><Calculator size={20} />Просчёт{meta.number ? ` №${meta.number}` : ''}<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">New beta</span>{dirty && <span className="text-xs font-normal text-amber-600">не сохранён</span>}</h1>
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
              <OpeningCard colors={colors} handlePhotos={handlePhotos} key={o.id} idx={idx} photos={photos} o={o} n={i + 1}
                onChange={fn => updOpening(o.id, fn)}
                onSize={(k, v) => setSize(o, k, v)}
                onRemove={() => update(e => { e.openings = e.openings.filter(x => x.id !== o.id); })}
                onDuplicate={() => update(e => { const c = clone(o); c.id = newOpening().id; c.room = o.room ? `${o.room} (2)` : ''; e.openings.splice(i + 1, 0, c); })}
                onPick={(group, filter) => setPicker({ target: { opening: o.id }, group, filter, ctx: o.sheet ? { sheet: o.sheet, model: o.model, openKind: o.openKind, hingeSys: o.hingeSys, finishCat: catOf(o) } : null })} />
            ))}
            <Button variant="outline" className="w-full h-12 border-dashed" onClick={addOpening}><Plus size={15} className="mr-1.5" />{est.openings.length ? 'Добавить ещё проём' : 'Добавить проём'}</Button>

            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Дополнительно к заказу</p>
                <Button size="sm" variant="outline" onClick={() => setPicker({ target: { opening: null }, group: 'all' })}><Plus size={14} className="mr-1" />Из прайса</Button>
              </div>
              {est.items.length === 0 && <p className="text-xs text-muted-foreground">Плинтус, панели, ручки, фурнитура отдельно — всё, что не относится к конкретному проёму.</p>}
              {est.items.map((l, k) => (
                <LineRow key={k} idx={idx} l={l} photo={handlePhotos[l.itemId]}
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
              <div className="border-t border-border pt-1.5 space-y-0.5">
                {CAT_ORDER.filter(c => (totals.byCat[c] ?? 0) > 0).map((c, i, arr) => (
                  <div key={c}>
                    {HARDWARE.includes(c) && !HARDWARE.includes(arr[i - 1]) && (
                      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Фурнитура</span><span>{money(HARDWARE.reduce((a, h) => a + (totals.byCat[h] ?? 0), 0))}</span></div>
                    )}
                    <div className={`flex justify-between text-xs ${HARDWARE.includes(c) ? 'pl-3 text-[11px]' : ''}`}><span className="text-muted-foreground">{CAT_LABEL[c]}</span><span className={HARDWARE.includes(c) ? 'text-muted-foreground' : ''}>{money(totals.byCat[c] ?? 0)}</span></div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-border pt-1.5"><span className="text-muted-foreground">Сумма по прайсу</span><span>{money(totals.sub)}</span></div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted-foreground">Скидка, %</span>
                <Input type="number" inputMode="decimal" min={0} max={100} className="h-8 w-20 text-right" value={est.discountPct || ''} placeholder="0"
                  onChange={e => update(x => { x.discountPct = Math.max(0, Math.min(100, Number(e.target.value) || 0)); })} />
              </div>
              <DiscountTargets byCat={totals.byCat} value={est.discountOn} onChange={v => update(x => { x.discountOn = v; })} />
              {totals.discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Скидка{est.discountOn?.length ? ` (${est.discountOn.map(c => CAT_LABEL[c].toLowerCase()).join(', ')})` : ''}</span><span className="whitespace-nowrap">−{money(totals.discount)}</span></div>}
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

      <PickerDialog idx={idx} photos={handlePhotos} state={picker} onClose={() => setPicker(null)} onPick={it => picker && addItem(picker.target, it)}
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
function OpeningCard({ idx, photos, colors, handlePhotos, o, n, onChange, onSize, onRemove, onDuplicate, onPick }: {
  idx: PriceIndex; photos: Record<string, string>; colors: ColorData | null; handlePhotos: HandlePhotos; o: Opening; n: number;
  onChange: (fn: (o: Opening) => void) => void;
  onSize: (k: 'height' | 'width' | 'leaves' | 'openKind', v: number | string) => void;
  onRemove: () => void; onDuplicate: () => void; onPick: (group: string, filter?: PickerState['filter']) => void;
}) {
  const b = calcOpening(idx, o);
  const s = idx.series.get(o.sheet);
  const model = s?.models.find(m => m.code === o.model);
  const groups = s ? [...new Set(s.width.map(m => m.group).filter(Boolean))] : [];
  // в «Опциях полотна» — только опции самого полотна; короба, наличники, доборы — через «Короба»
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
  const sizeWarn = lim ? [
    ...limitWarnings(lim, o),
    ...Array.from({ length: Math.max(1, o.leaves || 1) }, (_, i) => i).filter(i => i > 0 && leafOf(o, i).ownSize)
      .flatMap(i => { const lf = leafOf(o, i); return limitWarnings(lim, { ...o, height: lf.height, width: lf.width }).filter(w => !/не производится/.test(w)).map(w => `Полотно ${i + 1}: ${w}`); }),
  ] : [];
  const stH = lim && o.height ? heightStep(lim, o.height) : lim?.stepH;
  const stW = lim?.stepW;
  /** Размер не по шагу фабрики — после ввода сам округляем до ближайшего допустимого */
  const snap = (key: 'height' | 'width') => {
    const v = o[key];
    const st = key === 'height' ? (lim && v ? heightStep(lim, v) : undefined) : stW;
    if (!v || !st || st <= 1 || v % st === 0) return;
    const r = key === 'height' ? lim?.h : lim?.w;
    let nv = Math.round(v / st) * st;
    if (r) nv = Math.min(Math.max(nv, Math.ceil(r[0] / st) * st), Math.floor(r[1] / st) * st);
    onSize(key, nv);
    toast.info(`${key === 'height' ? 'Высота' : 'Ширина'} ${v} → ${nv} мм (шаг ${st} мм)`);
  };
  const onlyKinds = s ? (SIZE_RULES[s.sheet]?.models?.[o.model.trim()]?.only) : undefined;
  const kinds = s ? OPEN_KINDS.filter(k => (onlyKinds ? onlyKinds.includes(k.key) : !!SIZE_RULES[s.sheet]?.w[k.key]) || k.key === 'swing') : [];
  const catNow = variant?.label.match(/Категория (\d)/)?.[1];
  const optCat = finCat ?? (catNow ? Number(catNow) : 1);
  // в «Опциях полотна» — только опции самого полотна; короба, наличники, доборы — через «Короба».
  // Наценки за категорию покрытия и «Стекло 2» ставятся сами при выборе цвета/стекла; позиции «Категория N» — только под выбранный цвет
  const options = (s?.options ?? []).map(id => idx.byId.get(id)).filter((x): x is Item => {
    if (!x) return false;
    const nm = x.name.trim();
    if (/^(Коробка|Наличник|Добор|Плинтус)|погонаж|^Притворная планка/i.test(nm)) return false;   // притворные планки — через «Другое», не в опциях полотна
    if (/^Наценка на полотна (в покрытии|с остеклением)/i.test(nm)) return false;
    const c = nm.match(/Категори[яи]\s*"?(\d)/i)?.[1];
    return !c || Number(c) === optCat;
  });
  /** Выбор покрытия/стекла: сам переключает категорию (вариант цены) или ставит/снимает наценку за категорию */
  const applyFinish = (finish: string, cat: number | null) => onChange(x => {
    x.finish = finish;
    if (!s || cat == null) return;
    // «Притворная планка "Категория 1"» → такая же позиция под новую категорию
    x.options = x.options.map(l => {
      const it = idx.byId.get(l.itemId);
      const m = it?.name.match(/^(.*Категори[яи]\s*"?)(\d)(.*)$/i);
      if (!it || !m || Number(m[2]) === cat) return l;
      const twin = s.options.map(id => idx.byId.get(id)).find(t => t && t.name === `${m[1]}${cat}${m[3]}` && t.attrs.join() === it.attrs.join());
      return twin ? { ...l, itemId: twin.id } : l;
    });
    const m = s.models.find(mm => mm.code === x.model);
    const v = m?.variants.find(vv => new RegExp(`Категория ${cat}(\\D|$)`).test(vv.label));
    if (v) { x.variantId = v.id; return; }
    // наценку за категорию по числу полотен ставит syncLeafSurcharges
  });
  const pics = o.model ? modelPhotos(photos, o.sheet, o.model, wood) : [];
  const pic0 = o.photo && pics.some(p => p.url === o.photo) ? { url: o.photo, name: o.photoName ?? '' } : pics[0];
  // фото в выбранном цвете/стекле (крупное с сайта фабрики); нет такого — фото модели по умолчанию + образец цвета
  const tinted = colors && pic0 ? modelColorPhoto(colors, pic0.name, o.finish, o.insert) : null;
  const pic = pic0 ? { ...pic0, url: tinted ?? (colors ? modelDefaultPhoto(colors, pic0.name) : null) ?? pic0.url } : undefined;
  const swatch = colors && s && !tinted && o.finish ? swatchFor(colors, s.sheet, o.finish) : null;
  const swatchOf = (name: string) => (colors && s ? swatchFor(colors, s.sheet, name) : null);
  const nLeaves = Math.max(1, o.leaves || 1);
  const bOpt = s?.options.map(id => idx.byId.get(id)).find((it): it is Item => !!it && isBLeafItem(it));
  // какие полотна — ответные «B»: отмечены на фото; если не отмечали, но опция стоит — все, кроме первого
  const bMarked = Array.from({ length: nLeaves }, (_, i) => o.leafSet?.[i]?.b);
  const bLeaves = Array.from({ length: nLeaves }, (_, i) => i).filter(i => bMarked.some(v => v !== undefined) ? !!bMarked[i] : (!!bOpt && o.options.some(l => l.itemId === bOpt.id) && i > 0));
  const [leafEdit, setLeafEdit] = useState<number | null>(null);
  const [gridLeaf, setGridLeaf] = useState(0);
  /** Фото полотна i: его модель, цвет и стекло */
  const leafPhoto = (i: number) => {
    const lf = leafOf(o, i);
    if (i === 0 || !lf.own) {
      if (!pic) return null;
      const fin = i === 0 ? o.finish : lf.finish, ins = i === 0 ? o.insert : lf.insert;
      const t = colors && pic0 ? modelColorPhoto(colors, pic0.name, fin, ins) : null;
      return { name: pic.name, url: t ?? pic.url, swatch: colors && s && !t && fin ? swatchFor(colors, s.sheet, fin) : null };
    }
    const ps = modelPhotos(photos, o.sheet, lf.model, /дуб|орех|шпон|карамель|сонома|тобакко/i.test(lf.finish ?? ''));
    const p0 = (lf.photo && ps.find(p => p.url === lf.photo)) || ps[0];
    if (!p0) return null;
    const t = colors ? modelColorPhoto(colors, p0.name, lf.finish, lf.insert) : null;
    return { name: p0.name, url: t ?? (colors ? modelDefaultPhoto(colors, p0.name) : null) ?? p0.url, swatch: colors && s && !t && lf.finish ? swatchFor(colors, s.sheet, lf.finish) : null };
  };
  /** Изменить полотно i (для 2…N — своё; первое правит сам проём) */
  const setLeaf = (i: number, fn: (c: LeafCfg, x: Opening) => void) => onChange(x => {
    const n = Math.max(1, x.leaves || 1);
    x.leafSet = Array.from({ length: n }, (_, k) => ({ ...(x.leafSet?.[k] ?? {}) }));
    fn(x.leafSet[i], x);
  });
  /** Размер полотна i: первое — это размер проёма, у остальных — свой (равный первому не храним) */
  const setLeafSize = (i: number, key: 'height' | 'width', v: number) => {
    if (i === 0) { onSize(key, v); return; }
    setLeaf(i, (c, x) => { if (!v || v === x[key]) delete c[key]; else c[key] = v; });
  };
  const snapLeaf = (i: number, key: 'height' | 'width') => {
    if (i === 0) { snap(key); return; }
    const v = leafOf(o, i)[key];
    const st = key === 'height' ? (lim && v ? heightStep(lim, v) : undefined) : stW;
    if (!v || !st || st <= 1 || v % st === 0) return;
    const r = key === 'height' ? lim?.h : lim?.w;
    let nv = Math.round(v / st) * st;
    if (r) nv = Math.min(Math.max(nv, Math.ceil(r[0] / st) * st), Math.floor(r[1] / st) * st);
    setLeafSize(i, key, nv);
    toast.info(`Полотно ${i + 1}: ${key === 'height' ? 'высота' : 'ширина'} ${v} → ${nv} мм (шаг ${st} мм)`);
  };
  const ownLeaf = (c: LeafCfg, x: Opening) => { if (!c.model) { c.model = x.model; c.variantId = x.variantId; c.photo = x.photo; c.photoName = x.photoName; } };
  const finishPrice = (b: InfoBlock) => {
    if (!s || b.cat == null) return '';
    const v = model?.variants.find(vv => new RegExp(`Категория ${b.cat}(\\D|$)`).test(vv.label));
    if (v) return money(v.price);
    const opt = b.cat >= 2 ? categoryOption(idx, s, b.cat) : null;
    return opt ? (opt.kind === 'pct' ? `+${opt.pct}%` : `+${money(opt.price ?? 0)}`) : '';
  };
  const glassOptions = () => (s?.options ?? []).map(id => idx.byId.get(id)).filter((it): it is Item => !!it && /остеклени/i.test(it.name) && /Стекло \d/.test(it.name));
  const insertPrice = (b: InfoBlock) => {
    if (b.cat == null) return '';
    if (b.cat < 2) return 'в цене';
    const g = glassOptions().find(it => it.name.includes(`Стекло ${b.cat}`));
    return g ? `+${money(g.price ?? 0)}` : '';
  };
  /** Стекло/вставка: PD «Стекло 2» — наценку ставим и снимаем сами */
  const applyInsert = (item: string, b: InfoBlock) => onChange(x => {
    x.insert = item; void b; // наценку «Стекло 2» по числу полотен ставит syncLeafSurcharges
  });
  const chooseModel = (code: string, photo?: { name: string; url: string }) => onChange(x => {
    x.model = code;
    const m = s?.models.find(mm => mm.code === code);
    x.variantId = m && m.variants.length === 1 ? m.variants[0].id : (m?.variants.find(v => v.id === x.variantId)?.id ?? m?.variants[0]?.id ?? null);
    x.photo = photo?.url; x.photoName = photo?.name;
  });
  const chosen = new Map(o.options.map(l => [l.itemId, l]));
  const hwLines = o.extras.map((l, k) => ({ l, k, it: idx.byId.get(l.itemId) })).filter(x => x.it && HARDWARE.includes(catOfItem(x.it)));
  const hwOn = o.hardware ?? hwLines.length > 0;
  const hwSum = HARDWARE.reduce((a, c) => a + (b.byCat?.[c] ?? 0), 0);
  const extraRow = (l: Line, k: number) => {
    const it = idx.byId.get(l.itemId);
    const vv = o.variantId != null ? idx.variant.get(o.variantId) : undefined;
    const sys = currentSystem(o.sheet, vv?.model.code ?? o.model, o.openKind === 'book' ? 'book' : o.hingeSys);
    const fam = it ? hingeFamilyOf(it) : null;
    const hint = fam && sys?.families.includes(fam) ? hingesNeeded(sys, o, hasExtraLoad(idx, o)).total : null;
    return (
      <LineRow key={k} idx={idx} l={l} photo={handlePhotos[l.itemId]} hint={hint != null && hint !== l.qty ? `по прайсу ${hint} шт` : undefined}
        onQty={q => onChange(x => { x.extras[k].qty = q; x.extras[k].auto = false; })}
        onMods={m => onChange(x => { x.extras[k].mods = m; })}
        onRemove={() => onChange(x => { x.extras.splice(k, 1); })}
        colorCtl={it && idx.modsFor(it).some(m => /погонаж/i.test(m.name) && /категори/i.test(m.name)) ? {
          door: o.finish, value: l.color,
          blocks: (() => { const ss = idx.series.get(it.sheet) ?? idx.series.get(o.sheet); return ss ? finishBlocks(ss) : []; })(),
          onChange: v => onChange(x => { x.extras[k].color = v; }),
        } : undefined} />
    );
  };
  const sections = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of options) { const k = it.section || 'Опции'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(it); }
    return [...m.entries()];
  }, [o.sheet, optCat]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="shrink-0 w-full sm:w-max">
          <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1 overflow-x-auto" title="Нажмите на полотно: модель, цвет, сторона">
            {Array.from({ length: nLeaves }, (_, i) => {
              const lp = leafPhoto(i);
              const side = sideOf(o, i);
              const lf = leafOf(o, i);
              return (
                <button key={i} type="button" onClick={() => (o.model ? setLeafEdit(i) : (setGridLeaf(i), setGridOpen(true)))}
                  className={`relative shrink-0 rounded-md bg-white overflow-hidden flex flex-col items-center hover:ring-2 hover:ring-primary ${nLeaves > 1 ? 'w-[64px] sm:w-[72px]' : 'w-[84px] sm:w-[92px]'}`}>
                  {lp ? (
                    <span className="relative w-full h-[150px] sm:h-[200px] flex items-center justify-center">
                      <img key={lp.url} src={lp.url} alt="" referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" style={side === 'L' ? { transform: 'scaleX(-1)' } : undefined} />
                      {lp.swatch && <img src={lp.swatch} alt="" referrerPolicy="no-referrer" title={`Цвет: ${lf.finish} (фото модели в этом цвете на сайте фабрики нет)`} className="absolute bottom-1 right-1 w-5 h-5 rounded-full border border-white shadow object-cover" />}
                    </span>
                  ) : <span className="h-[150px] sm:h-[200px] flex items-center px-1 text-center text-[10px] text-muted-foreground">Выбрать по фото</span>}
                  <span className="w-full text-[10px] leading-tight text-center text-muted-foreground py-0.5 truncate px-0.5">
                    {nLeaves > 1 ? `${i + 1} · ` : ''}{side ? (side === 'L' ? 'левая' : 'правая') : (lp?.name || o.model || '')}
                    {nLeaves > 1 && <span className={`block ${lf.ownSize ? 'text-primary font-medium' : ''}`}>{lf.height}×{lf.width}</span>}
                  </span>
                  {nLeaves > 1 && bLeaves.includes(i) && <span className="absolute top-1 right-1 rounded-full bg-amber-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center shadow" title="Ответное B-полотно">B</span>}
                  {nLeaves > 1 && lf.own && lf.model !== o.model && <span className="absolute top-0.5 inset-x-0.5 rounded bg-primary text-primary-foreground text-[9px] px-1 truncate text-center">{lp?.name || lf.model}</span>}
                </button>
              );
            })}
          </div>
          {o.model && <p className="text-[10px] leading-tight text-muted-foreground text-center mt-0.5 max-w-[150px] mx-auto">{nLeaves > 1 ? 'Нажмите на полотно — модель, цвет, сторона' : 'Нажмите — модель, цвет, сторона'}</p>}
        </div>
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
        {model && model.variants.length > 1 && !model.variants.every(v => /Категория \d/.test(v.label)) ? (
          <label className="text-xs text-muted-foreground space-y-1">Вариант
            <select className={selCls} value={o.variantId ?? ''}
              onChange={e => onChange(x => { x.variantId = Number(e.target.value) || null; })}>
              {model.variants.map(v => <option key={v.id} value={v.id}>{v.label || 'стандарт'} — {money(v.price)}</option>)}
            </select>
          </label>
        ) : (
          <div className="text-xs text-muted-foreground space-y-1">
            <span className="block">{fBlocks.length ? 'Покрытие' : 'Вариант'}{iBlocks.length ? ' / стекло' : ''}</span>
            <button type="button" disabled={!model} onClick={() => { if (fBlocks.length || iBlocks.length) setFinishOpen(true); }}
              className={`${selCls} text-left truncate ${o.finish || o.insert ? 'border-primary text-foreground' : 'text-muted-foreground'} disabled:opacity-50`}>
              {(o.finish || o.insert) ? [o.finish || (fBlocks.length ? 'цвет не выбран' : ''), o.insert].filter(Boolean).join(' · ') : (variant?.label ? `${variant.label}${fBlocks.length ? ' — выбрать' : ''}` : (fBlocks.length ? 'Выбрать' : 'стандарт'))}
            </button>
          </div>
        )}
        <label className="text-xs text-muted-foreground space-y-1">Высота, мм
          <Input type="number" step={stH || 50} className="h-9" value={o.height || ''} onChange={e => onSize('height', Number(e.target.value) || 0)} onBlur={() => snap('height')} />
        </label>
        <label className="text-xs text-muted-foreground space-y-1">{(o.leaves ?? 1) > 1 ? 'Ширина 1 полотна' : 'Ширина, мм'}
          <Input type="number" step={stW || 50} className="h-9" value={o.width || ''} onChange={e => onSize('width', Number(e.target.value) || 0)} onBlur={() => snap('width')} />
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
            {(o.leaves ?? 1) > 1 && <span className="block text-[11px]">Проём по полотнам ≈ {leavesWidth(o)} мм. Опции — укажите, на сколько полотен.</span>}
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
                  {o.insert ? <>{iBlocks.every(b => /стекл/i.test(b.title)) ? 'Стекло' : 'Вставка'}: <b>{o.insert}</b></> : (iBlocks.every(b => /стекл/i.test(b.title)) ? 'Выбрать стекло' : 'Выбрать вставку')}
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
      {s && <ChipsDialog open={finishOpen} onClose={() => setFinishOpen(false)} title={`Серия ${s.sheet}: ${iBlocks.length ? 'покрытие и стекло' : 'покрытие / стекло'}`} blocks={[...fBlocks, ...iBlocks]} current={o.finish} current2={o.insert}
        hint={catNow ? `Сейчас выбрана Категория ${catNow}. Выбор из другой категории сам поменяет цену.` : 'Категория 2 и выше — сайт сам добавит наценку.'}
        priceFor={b => b.insert ? insertPrice(b) : finishPrice(b)} swatch={swatchOf}
        onPick={(item, b) => { if (b.insert) applyInsert(item, b); else applyFinish(item, b.cat); if (!iBlocks.length || b.insert || o.insert) setFinishOpen(false); }} />}
      {s && <ChipsDialog open={insertOpen} onClose={() => setInsertOpen(false)} title={iBlocks.every(b => /стекл/i.test(b.title)) ? "Стекло в полотне" : "Вставка в полотно"} blocks={iBlocks} current={o.insert}
        onPick={(item, b) => { applyInsert(item, b); setInsertOpen(false); }} priceFor={insertPrice} swatch={swatchOf} />}
      {s && leafEdit != null && (() => {
        const i = leafEdit;
        const lf = leafOf(o, i);
        const side = sideOf(o, i);
        const lv = lf.variantId != null ? idx.variant.get(lf.variantId) : undefined;
        const blocks = [...fBlocks, ...insertBlocks(s, lf.model, lv?.v.label ?? '')];
        const lp = leafPhoto(i);
        const pick = (item: string, b: InfoBlock) => {
          if (i === 0) { if (b.insert) applyInsert(item, b); else applyFinish(item, b.cat); }
          else setLeaf(i, (c, x) => { ownLeaf(c, x); if (b.insert) c.insert = item; else c.finish = item; });
        };
        return (
          <Dialog open onOpenChange={v => !v && setLeafEdit(null)}>
            <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
              <DialogHeader><DialogTitle>{nLeaves > 1 ? `Полотно ${i + 1} из ${nLeaves}` : 'Полотно'} · {lf.model}</DialogTitle></DialogHeader>
              <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                <div className="flex gap-3">
                  <div className="w-[84px] h-[190px] shrink-0 rounded-md border border-border bg-white flex items-center justify-center overflow-hidden">
                    {lp && <img src={lp.url} alt="" referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" style={side === 'L' ? { transform: 'scaleX(-1)' } : undefined} />}
                  </div>
                  <div className="space-y-2 min-w-0">
                    <p className="text-xs text-muted-foreground">Сторона открывания (смотрим со стороны, куда открывается дверь)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(['L', 'R'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setLeaf(i, c => { c.side = c.side === k && nLeaves === 1 ? undefined : k; })}
                          className={`text-xs rounded-md border px-3 py-1.5 ${side === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{k === 'L' ? '⟲ Левая · петли слева' : 'Правая · петли справа ⟳'}</button>
                      ))}
                    </div>
                    {bOpt && nLeaves > 1 && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-1">
                        <input type="checkbox" className="h-4 w-4" checked={bLeaves.includes(i)}
                          onChange={e => onChange(x => {
                            const cur = bLeaves;
                            x.leafSet = Array.from({ length: nLeaves }, (_, k) => ({ ...(x.leafSet?.[k] ?? {}), b: k === i ? e.target.checked : cur.includes(k) }));
                          })} />
                        <span><b>B-полотно</b> (ответное) <span className="text-xs text-muted-foreground">+{money(bOpt.price ?? 0)}</span></span>
                      </label>
                    )}
                    {bOpt && nLeaves > 1 && bLeaves.length === nLeaves && <p className="text-[11px] text-amber-700">Все полотна отмечены как B — обычно одно полотно основное.</p>}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button size="sm" variant="outline" onClick={() => { setGridLeaf(i); setGridOpen(true); }}>Другая модель по фото</Button>
                      {i > 0 && lf.own && <Button size="sm" variant="ghost" onClick={() => setLeaf(i, c => { delete c.model; delete c.variantId; delete c.finish; delete c.insert; delete c.photo; delete c.photoName; })}>Как полотно 1</Button>}
                    </div>
                    {i > 0 && <p className="text-[11px] text-muted-foreground">{lf.own ? 'У этого полотна своя модель/цвет — цена считается по ней.' : 'Сейчас как полотно 1. Выберите другую модель или цвет — будет своя.'}</p>}
                  </div>
                </div>
                <div className="rounded-md border border-border p-2.5 space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    {(['height', 'width'] as const).map(key => (
                      <label key={key} className="text-xs text-muted-foreground space-y-1">{key === 'height' ? 'Высота полотна, мм' : 'Ширина полотна, мм'}
                        <Input type="number" className="h-9" step={(key === 'height' ? (lim ? heightStep(lim, lf.height) : undefined) : stW) || 50}
                          value={lf[key] || ''} onChange={e => setLeafSize(i, key, Number(e.target.value) || 0)} onBlur={() => snapLeaf(i, key)} />
                      </label>
                    ))}
                  </div>
                  {i > 0 && lf.ownSize && <button type="button" className="text-[11px] text-primary underline" onClick={() => setLeaf(i, c => { delete c.height; delete c.width; })}>Размер как у полотна 1 ({o.height}×{o.width})</button>}
                  {i > 0 && !lf.ownSize && <p className="text-[11px] text-muted-foreground">Размер как у полотна 1 — можно задать свой (например, узкое ответное полотно).</p>}
                  {i === 0 && nLeaves > 1 && <p className="text-[11px] text-muted-foreground">Размер полотна 1 — он же по умолчанию для остальных.</p>}
                  {lim && limitWarnings(lim, { ...o, height: lf.height, width: lf.width }).map(w => <p key={w} className="text-[11px] text-amber-700 font-medium">⚠ {w}</p>)}
                </div>
                {blocks.map(b => {
                  const pr = b.insert ? insertPrice(b) : finishPrice(b);
                  const cur = b.insert ? lf.insert : lf.finish;
                  return (
                    <div key={b.title}>
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <p className="text-sm font-semibold">{b.title.replace(/^Серия \S+ · /, '').replace(/^Вставки стекла: /, 'Стекло — ') || 'Варианты'}</p>
                        {pr && <span className="text-xs text-muted-foreground whitespace-nowrap">{pr}</span>}
                      </div>
                      {b.lists.map(l => (
                        <div key={l.type} className="mb-1.5">
                          {(b.lists.length > 1 || !/^(Цвета|Варианты)$/.test(l.type)) && <p className="text-[11px] text-muted-foreground mb-1">{l.type}</p>}
                          <div className="flex flex-wrap gap-1">
                            {l.items.map(it => { const u = swatchOf(it); return (
                              <button key={it} type="button" onClick={() => pick(it, b)}
                                className={`inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1 ${cur === it ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>
                                {u && <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-4 h-4 -ml-1 rounded-full object-cover border border-black/10" />}{it}</button>
                            ); })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between gap-2 pt-1">
                <div className="flex gap-1">{nLeaves > 1 && Array.from({ length: nLeaves }, (_, k) => <Button key={k} size="sm" variant={k === i ? 'default' : 'outline'} onClick={() => setLeafEdit(k)}>{k + 1}</Button>)}</div>
                <Button size="sm" onClick={() => setLeafEdit(null)}>Готово</Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
      {s && <ModelGrid open={gridOpen} onClose={() => setGridOpen(false)} sheet={s.sheet} models={s.models.map(m => m.code)} photos={photos} wood={wood}
        current={gridLeaf > 0 ? leafOf(o, gridLeaf).model : o.model} onPick={(code, p) => {
          if (gridLeaf > 0) setLeaf(gridLeaf, c => {
            const m = s.models.find(mm => mm.code === code);
            c.model = code; c.photo = p?.url; c.photoName = p?.name;
            c.variantId = m?.variants.find(v => v.label === variant?.label)?.id ?? m?.variants[0]?.id ?? null;
          });
          else chooseModel(code, p);
          setGridOpen(false);
        }} priceOf={code => s.models.find(m => m.code === code)?.variants[0]?.price ?? 0} />}

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
                            const n = Math.max(1, x.leaves || 1);
                            if (isBLeafItem(it) && n > 1) {
                              // «B»-полотно в двустворчатом проёме: по умолчанию — все, кроме первого; какое именно — выбирается на фото
                              x.leafSet = Array.from({ length: n }, (_, k) => ({ ...(x.leafSet?.[k] ?? {}), b: e.target.checked ? k > 0 : false }));
                              return;
                            }
                            if (e.target.checked) x.options.push({ itemId: it.id, qty: defaultOptQty(it, x.leaves || 1) }); else x.options = x.options.filter(y => y.itemId !== it.id);
                          })} />
                          <span className="flex-1 min-w-0">{itemLabel(it)}
                            {l && isBLeafItem(it) && nLeaves > 1 && <span className="block text-[11px] text-primary">полотно {bLeaves.map(i => i + 1).join(', ') || '—'} · какое — нажмите на дверь на фото</span>}
                          </span>
                          {l && it.kind === 'price' && !(isBLeafItem(it) && nLeaves > 1) && (/к-кт|шт|компл/.test(it.unit) || (o.leaves ?? 1) > 1) && (
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

      {/* Комплектующие: короб, погонаж, системы */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm mr-1">Комплектующие:</span>
          {PICK_GROUPS.filter(g => ['box', 'sys', 'all'].includes(g.key)).map(g => (
            <Button key={g.key} size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPick(g.key)}><Plus size={12} className="mr-0.5" />{g.label === 'Весь прайс' ? 'Другое' : g.label}</Button>
          ))}
        </div>
        {s && o.model && <KitPanel idx={idx} o={o} onChange={onChange} onPick={onPick} part="box" />}
        {o.extras.map((l, k) => ({ l, k, it: idx.byId.get(l.itemId) })).filter(x => x.it && !HARDWARE.includes(catOfItem(x.it))).map(({ l, k }) => extraRow(l, k))}
      </div>

      {/* Фурнитура: петли, замки, ручки — считается отдельно */}
      <div className={`rounded-lg border ${hwOn ? 'border-primary/30' : 'border-dashed border-border'} p-2.5 space-y-1.5`}>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" className="h-4 w-4" checked={hwOn} onChange={e => onChange(x => { x.hardware = e.target.checked; })} />
          <span className="font-medium">Фурнитура</span><span className="text-xs text-muted-foreground">петли, замки, ручки</span>
          {hwOn && hwSum > 0 && <span className="ml-auto text-sm font-medium">{money(hwSum)}</span>}
        </label>
        {!hwOn && hwLines.length > 0 && <p className="text-[11px] text-amber-700">В проёме {hwLines.length} поз. фурнитуры — сейчас не считаются. Поставьте галочку, чтобы учесть.</p>}
        {hwOn && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {PICK_GROUPS.filter(g => ['hinge', 'lock', 'handle', 'fitting'].includes(g.key)).map(g => (
                <Button key={g.key} size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPick(g.key)}><Plus size={12} className="mr-0.5" />{g.label}</Button>
              ))}
            </div>
            {s && o.model && <KitPanel idx={idx} o={o} onChange={onChange} onPick={onPick} part="hardware" />}
            {hwLines.map(({ l, k }) => extraRow(l, k))}
          </>
        )}
      </div>

      {/* Расчёт */}
      <div className="rounded-lg border border-border/70 px-3 py-2 text-xs space-y-0.5">
        {b.error && <p className="text-amber-700">{b.error}</p>}
        {o.variantId != null && <>
          <Row l={`Полотно по прайсу${(b.leaves ?? 1) > 1 ? ' (одно)' : ''}`} v={money(b.base)} />
          {b.glassAdd && <Row l={`${b.glassAdd.item.name}${o.insert ? ` (${o.insert})` : ''}`} v={`+${money(b.glassAdd.sum)}`} />}
          {b.catAdd && <Row l={`${b.catAdd.item.name}${o.finish ? ` (${o.finish})` : ''}`} v={`+${money(b.catAdd.sum)}`} />}
          {(b.catAdd || b.glassAdd) && <Row l="Полотно со стеклом и покрытием" v={money(b.base + (b.catAdd?.sum ?? 0) + (b.glassAdd?.sum ?? 0))} />}
          {b.heightMk && <Row l={`Наценка на высоту ${o.height} мм`} v={`+${b.heightMk.pct}%`} />}
          {b.widthMk && <Row l={`${b.widthMk.pct < 0 ? 'Уценка' : 'Наценка'} на ширину ${o.width} мм`} v={`${b.widthMk.pct > 0 ? '+' : ''}${b.widthMk.pct}%`} />}
          {(b.heightMk || b.widthMk) && <Row l={`Полотно с наценками${(b.leaves ?? 1) > 1 ? ' (одно)' : ''}`} v={money(b.afterSize)} />}
          {(b.leaves ?? 1) > 1 && !b.leafPrices && <Row l={`× ${b.leaves} полотна в проёме`} v={money(b.afterSize * (b.leaves ?? 1))} />}
          {b.leafPrices?.map((x, i) => <Row key={i} l={`Полотно ${i + 1}: ${x.label}, ${x.size}${x.mk ? ` (${x.mk})` : ''}`} v={money(x.after)} />)}
          {b.pctOptions.map(x => <Row key={x.item.id} l={x.item.name} v={`+${money(x.sum)}`} />)}
          {b.fixedOptions.filter(x => x.sum > 0).map(x => <Row key={x.item.id} l={`${x.item.name}${x.qty > 1 ? ` ×${x.qty}` : ''}`} v={`+${money(x.sum)}`} />)}
          <Row l="Полотно итого" v={money(b.door)} bold />
        </>}
        {CAT_ORDER.filter(c => c !== 'door' && (b.byCat?.[c] ?? 0) > 0).map(c => <Row key={c} l={HARDWARE.includes(c) ? `Фурнитура: ${CAT_LABEL[c].toLowerCase()}` : CAT_LABEL[c]} v={money(b.byCat![c]!)} />)}
        {b.warnings.map(w => <p key={w} className="text-amber-700">{w}</p>)}
        <div className="flex justify-between pt-1 mt-1 border-t border-border/60 text-sm font-semibold">
          <span>Проём{o.qty > 1 ? ` × ${o.qty}` : ''}</span><span>{money(b.total)}</span>
        </div>
      </div>
      <Input className="h-8 text-xs" placeholder="Заметка к проёму (сторонность, открывание, монтаж…)" value={o.note} onChange={e => onChange(x => { x.note = e.target.value; })} />
    </div>
  );
}

const CAT_ORDER: Cat[] = ['door', 'box', 'sys', 'hinge', 'lock', 'handle', 'fitting', 'other'];
/** Чему давать скидку: на всё или выбранным группам (например, только петли и ручки) */
function DiscountTargets({ byCat, value, onChange }: { byCat: Partial<Record<Cat, number>>; value?: Cat[]; onChange: (v: Cat[] | undefined) => void }) {
  const [open, setOpen] = useState(!!value?.length);
  const all = !value?.length;
  const present = CAT_ORDER.filter(c => (byCat[c] ?? 0) > 0 || value?.includes(c));
  const toggle = (c: Cat) => { const cur = new Set(value ?? []); if (cur.has(c)) cur.delete(c); else cur.add(c); onChange(cur.size ? CAT_ORDER.filter(x => cur.has(x)) : undefined); };
  const hwAll = HARDWARE.filter(c => present.includes(c));
  return (
    <div className="text-xs">
      <button type="button" className="text-primary hover:underline" onClick={() => setOpen(v => !v)}>
        Скидка на: <b>{all ? 'всё' : value!.map(c => CAT_LABEL[c].toLowerCase()).join(', ')}</b> {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-border p-2 space-y-1">
          <label className="flex items-center gap-2"><input type="checkbox" checked={all} onChange={() => onChange(undefined)} />На всё</label>
          {present.filter(c => !HARDWARE.includes(c)).map(c => (
            <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={!!value?.includes(c)} onChange={() => toggle(c)} />{CAT_LABEL[c]}<span className="ml-auto text-muted-foreground">{money(byCat[c] ?? 0)}</span></label>
          ))}
          {hwAll.length > 0 && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={hwAll.every(c => value?.includes(c))}
                onChange={e => { const cur = new Set(value ?? []); hwAll.forEach(c => (e.target.checked ? cur.add(c) : cur.delete(c))); onChange(cur.size ? CAT_ORDER.filter(x => cur.has(x)) : undefined); }} />Фурнитура</label>
              {hwAll.map(c => (
                <label key={c} className="flex items-center gap-2 pl-5"><input type="checkbox" checked={!!value?.includes(c)} onChange={() => toggle(c)} />{CAT_LABEL[c]}<span className="ml-auto text-muted-foreground">{money(byCat[c] ?? 0)}</span></label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const Row = ({ l, v, bold }: { l: string; v: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-3 ${bold ? 'font-medium text-foreground' : 'text-muted-foreground'}`}><span className="min-w-0">{l}</span><span className="whitespace-nowrap">{v}</span></div>
);

interface ColorCtl { door?: string; blocks: InfoBlock[]; value?: string; onChange: (v: string | undefined) => void }
function LineRow({ idx, l, hint, onQty, onMods, onRemove, colorCtl, photo }: { idx: PriceIndex; l: Line; hint?: string; onQty: (q: number) => void; onMods: (m: number[]) => void; onRemove: () => void; colorCtl?: ColorCtl; photo?: [string, Record<string, string>] }) {
  const [zoom, setZoom] = useState(false);
  const it = idx.byId.get(l.itemId);
  if (!it) return null;
  const allMods = idx.modsFor(it);
  const isCatMod = (m: Item) => /погонаж/i.test(m.name) && /категори/i.test(m.name);
  // наценку за покрытие погонажа выбираем цветом погонажа, а не галочкой
  const mods = colorCtl ? allMods.filter(m => !isCatMod(m)) : allMods;
  const catMod = colorCtl ? allMods.find(m => isCatMod(m) && (l.mods ?? []).includes(m.id)) : undefined;
  const sum = (it.price ?? 0) * (l.mods ?? []).reduce((a, id) => a * (1 + (idx.byId.get(id)?.pct ?? 0) / 100), 1) * l.qty;
  return (
    <div className="rounded-lg border border-border/70 px-2.5 py-1.5">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        {photo && <img src={photo[0]} alt="" loading="lazy" referrerPolicy="no-referrer" title="Нажмите, чтобы увеличить" onClick={() => setZoom(true)} className="w-14 h-14 shrink-0 rounded border border-border bg-white object-contain cursor-zoom-in" />}
        {photo && zoom && <PhotoDialog title={itemLabel(it)} main={photo[0]} colors={photo[1]} onClose={() => setZoom(false)} />}
        <div className="basis-full sm:basis-auto flex-1 min-w-0">
          <p className="text-sm sm:truncate" title={itemLabel(it)}>{itemLabel(it)}</p>
          <p className="text-[11px] text-muted-foreground truncate">{it.sheet}{it.section ? ` · ${it.section}` : ''} · {money(it.price ?? 0)} / {it.unit || 'шт'}{hint && <span className="text-amber-700"> · {hint}</span>}</p>
        </div>
        <Input type="number" min={0} step="any" className="h-8 w-16 px-1.5 text-sm" value={l.qty} onChange={e => onQty(Math.max(0, Number(e.target.value) || 0))} />
        <span className="ml-auto sm:ml-0 w-24 text-right text-sm font-medium whitespace-nowrap">{money(sum)}</span>
        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={onRemove} title="Убрать"><X size={15} /></button>
      </div>
      {(mods.length > 0 || colorCtl) && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {colorCtl && (
            <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mr-1">Цвет:
              <select className={`h-6 rounded-full border px-1.5 text-[11px] bg-background ${catMod ? 'border-primary text-primary' : 'border-border'}`}
                value={colorCtl.value ?? ''} onChange={e => colorCtl.onChange(e.target.value || undefined)}>
                <option value="">как у двери{colorCtl.door ? ` (${colorCtl.door})` : ''}</option>
                {colorCtl.blocks.map(b => (
                  <optgroup key={b.title} label={b.title.replace(/^Серия \S+ · /, '').replace(/\..*$/, '')}>
                    {b.lists.flatMap(li => li.items).map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
              {catMod && <span className="text-primary">{catMod.name.replace(/^Наценка на погонаж в покрытии\s*/i, 'покрытие ')} +{catMod.pct}%</span>}
            </label>
          )}
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
function KitPanel({ idx, o, onChange, onPick, part }: {
  idx: PriceIndex; o: Opening; onChange: (fn: (o: Opening) => void) => void;
  onPick: (group: string, filter?: PickerState['filter']) => void; part: 'box' | 'hardware';
}) {
  const systems = hingeSystems(o.sheet, o.model);
  if (!systems.length) return null;
  const kind = o.openKind ?? 'swing';
  if (kind !== 'swing' && kind !== 'book') return null;   // раздвижные/Pivot/Magic — петли не нужны, система выбирается отдельно
  const sys = currentSystem(o.sheet, o.model, kind === 'book' ? 'book' : o.hingeSys)!;
  const leaves = Math.max(1, o.leaves || 1);
  const hn = hingesNeeded(sys, o, hasExtraLoad(idx, o));
  const need = hn.total;
  const perTxt = hn.per.every(x => x === hn.per[0]) ? `${hn.per[0]} × ${leaves} полотна` : hn.per.join(' + ');
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
  const otherBoxes: { b: BoxKey; s: HingeSys }[] = [];
  for (const s2 of systems) {
    if (s2.key === 'book' || s2.key === sys.key) continue;
    for (const b of s2.boxes) if (!sys.boxes.includes(b) && !otherBoxes.some(x => x.b === b)) otherBoxes.push({ b, s: s2 });
  }
  if (part === 'box' && !(kind === 'swing' && systems.length > 1) && !sys.boxes.length && !(sys.reverse && revOpt && !hasRev)) return null;
  const addHinge = (it: Item) => onChange(x => {
    x.extras = x.extras.filter(l => { const f = hingeFamilyOf(idx.byId.get(l.itemId)!); return !f; });
    x.extras.push({ itemId: it.id, qty: need, auto: true });
  });
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5 space-y-2 text-xs">
      {part === 'box' && kind === 'swing' && systems.length > 1 && (
        <label className="flex flex-wrap items-center gap-2"><span className="text-muted-foreground">Открывание и петли:</span>
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={sys.key} onChange={e => onChange(x => { x.hingeSys = e.target.value; })}>
            {systems.filter(x => x.key !== 'book').map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
      )}
      {/* Петли */}
      {part === 'hardware' && <div className="space-y-1">
        <p><span className="font-medium">Петли:</span> {sys.included ? <span className="text-emerald-700">{sys.included} — {need} шт.</span> : <>нужно <b>{need} шт.</b>{leaves > 1 ? ` (${perTxt})` : ''}{sys.note ? <span className="text-muted-foreground"> · {sys.note}</span> : null}</>}</p>
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
      </div>}
      {/* Короб */}
      {part === 'box' && sys.boxes.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium mr-1">Короб подходит:</span>
            {sys.boxes.map(b => (
              <button key={b} type="button" onClick={() => onPick('box', { box: b, series: o.sheet })}
                className={`rounded-full border px-2 py-0.5 ${boxLines.some(x => x.key === b) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary'}`}>{BOX_LABEL[b]}</button>
            ))}
          </div>
          {/* Короба серии с другими петлями (например, моноблок у PE.O — на петлях Eclipse): выбор короба сам переключает петли */}
          {kind === 'swing' && otherBoxes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground mr-1">С другими петлями:</span>
              {otherBoxes.map(({ b, s }) => (
                <button key={b} type="button" title={`Переключит открывание на «${s.label}»`}
                  onClick={() => { onChange(x => { x.hingeSys = s.key; }); onPick('box', { box: b, series: o.sheet }); }}
                  className="rounded-full border border-dashed border-border bg-background px-2 py-0.5 hover:border-primary">
                  {BOX_LABEL[b]} <span className="text-muted-foreground">· {s.label.split('·').pop()!.trim()}</span>
                </button>
              ))}
            </div>
          )}
          {badBoxes.map(x => <p key={x.it.id} className="text-amber-700">⚠ Короб {BOX_LABEL[x.key!]} не подходит к «{sys.label}» — нужен: {sys.boxes.map(b => BOX_LABEL[b]).join(', ')}</p>)}
        </div>
      )}
      {part === 'box' && sys.reverse && revOpt && !hasRev && (
        <p className="text-amber-700">⚠ Открывание от себя — нужно полотно REVERSE.{' '}
          <button type="button" className="underline text-primary" onClick={() => onChange(x => { x.options.push({ itemId: revOpt.id, qty: Math.max(1, x.leaves || 1) }); })}>Добавить (+{money((revOpt.price ?? 0) * leaves)})</button></p>
      )}
      {part === 'hardware' && notes.map(nt => (
        <p key={nt.text} className="text-foreground/80">• {nt.text}{nt.addIds && <> {' '}<button type="button" className="underline text-primary" onClick={() => onChange(x => { for (const id of nt.addIds!) x.extras.push({ itemId: id, qty: 1 }); })}>добавить</button></>}</p>
      ))}
    </div>
  );
}

// ─── Выбор покрытия / стекла / вставки ───────────────────────────────────────
function ChipsDialog({ open, onClose, title, blocks, current, current2, hint, priceFor, onPick, swatch }: {
  open: boolean; onClose: () => void; title: string; blocks: InfoBlock[]; current?: string; current2?: string; hint?: string; swatch?: (name: string) => string | null;
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
                  <p className="text-sm font-semibold">{b.title.replace(/^Серия \S+ · /, '').replace(/^Вставки стекла: /, 'Стекло — ') || 'Варианты'}</p>
                  {pr && <span className="text-xs text-muted-foreground whitespace-nowrap">{pr}</span>}
                </div>
                <div className="space-y-2">
                  {b.lists.map(l => (
                    <div key={l.type}>
                      {(b.lists.length > 1 || !/^(Цвета|Варианты)$/.test(l.type)) && <p className="text-[11px] text-muted-foreground mb-1">{l.type}</p>}
                      <div className="flex flex-wrap gap-1">
                        {l.items.map(it => (
                          <button key={it} type="button" onClick={() => onPick(it, b)}
                            className={`inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1 ${(b.insert ? (current2 ?? current) : current) === it ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>
                            {(() => { const u = swatch?.(it); return u ? <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-4 h-4 -ml-1 rounded-full object-cover border border-black/10" /> : null; })()}{it}</button>
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
interface PickerState { target: { opening: string | null }; group: string; filter?: { box: BoxKey; series: string }; ctx?: PickCtx | null }

function PickerDialog({ idx, state, onClose, onPick, onGroup, photos }: {
  idx: PriceIndex; state: PickerState | null; onClose: () => void; onPick: (it: Item) => void; onGroup: (g: string) => void; photos: HandlePhotos;
}) {
  const [zoom, setZoom] = useState<{ title: string; main: string; colors: Record<string, string> } | null>(null);
  const filter = state?.filter;
  const ctx = state?.ctx ?? null;
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setShowAll(false); }, [state?.group, state?.target.opening]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('');
  useEffect(() => { if (state) setQ(''); }, [state?.group]); // eslint-disable-line react-hooks/exhaustive-deps
  const group = PICK_GROUPS.find(g => g.key === state?.group) ?? PICK_GROUPS[PICK_GROUPS.length - 1];
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return idx.data.catalog.filter(it => it.kind === 'price'
      && (filter ? boxItemMatches(it, filter.box, filter.series)
        : (ctx && !showAll && group.key !== 'all') ? fitsOpening(idx, it, group.key, ctx)
        : (!group.sheets || group.sheets.includes(it.sheet)))
      && words.every(w => `${itemLabel(it)} ${it.sheet} ${it.section} ${it.sub}`.toLowerCase().includes(w)))
      // ручки своей линейки (Orange / PROFILDOORS) — первыми
      .sort((a, b) => {
        if (!ctx || !/^Дверные ручки/.test(a.sheet) || !/^Дверные ручки/.test(b.sheet)) return 0;
        const own = ORANGE.includes(ctx.sheet) ? 'Дверные ручки Orange' : 'Дверные ручки';
        return (a.sheet === own ? 0 : 1) - (b.sheet === own ? 0 : 1);
      });
  }, [idx, group, q, filter, ctx, showAll]);
  const isHandles = !filter && group.key === 'handle';
  const [detail, setDetail] = useState(false);
  useEffect(() => { setDetail(false); }, [state?.group, state?.target.opening]); // eslint-disable-line react-hooks/exhaustive-deps
  const bySheet = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of list.slice(0, 400)) { const sec = idx.series.has(it.sheet) && !/погонаж|короб/i.test(it.section) ? (/телескоп/i.test(it.name) || /наличник|добор|плинтус/i.test(it.name) ? 'Погонаж' : it.section) : it.section; const k = `${it.sheet}${sec ? ' · ' + sec : ''}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(it); }
    return [...m.entries()];
  }, [list]);
  return (
    <Dialog open={!!state} onOpenChange={v => !v && onClose()}>
      <DialogContent className={isHandles ? 'max-w-5xl w-[96vw] h-[92vh] flex flex-col' : 'max-w-2xl max-h-[85vh] flex flex-col'}>
        <DialogHeader><DialogTitle>{filter ? `Короб ${BOX_LABEL[filter.box]} — что добавить` : 'Добавить из прайса'}</DialogTitle></DialogHeader>
        {filter && <p className="text-xs text-muted-foreground -mt-2">Показаны только позиции этого короба (сам короб, наличники, доборы). Другие — во вкладках ниже.</p>}
        {!detail && !filter && ctx && group.key !== 'all' && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground -mt-1">
            <input type="checkbox" checked={!showAll} onChange={e => setShowAll(!e.target.checked)} />
            Только то, что подходит к серии {ctx.sheet}{ctx.model ? `, модель ${ctx.model}` : ''}
          </label>
        )}
        <div className={`flex flex-wrap gap-1 ${detail ? 'hidden' : ''}`}>
          {PICK_GROUPS.map(g => (
            <button key={g.key} type="button" onClick={() => onGroup(g.key)}
              className={`text-xs rounded-full border px-2.5 py-1 ${g.key === group.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{g.label}</button>
          ))}
        </div>
        <div className={`relative ${detail ? 'hidden' : ''}`}>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="pl-8" placeholder="Поиск: invisible, eclipse, touch, ручка sly…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {isHandles ? <HandleGrid key={`${state?.target.opening}`} items={list} photos={photos} onPick={onPick} onDetail={setDetail} /> : (
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-3">
          {bySheet.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">{(!showAll && !q && ctx && emptyReason(group.key, ctx)) || 'Ничего не найдено'}</p>}
          {!showAll && ctx && !filter && group.key === 'lock' && bySheet.length > 0 && <p className="text-[11px] text-muted-foreground">Touch, Wave и Vitra выбираются в «Опциях полотна» — там они сразу считаются с полотном.</p>}
          {bySheet.map(([k, items]) => (
            <div key={k}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 sticky top-0 bg-background py-0.5">{k}</p>
              {items.map(it => (
                <button key={it.id} type="button" onClick={() => onPick(it)}
                  className="w-full flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                  {!photos[it.id] && /^Дверные ручки/.test(it.sheet) && <span className="w-12 h-12 shrink-0" />}
                  {photos[it.id] && (
                    <img src={photos[it.id][0]} alt="" loading="lazy" referrerPolicy="no-referrer" title="Нажмите, чтобы увеличить"
                      onClick={e => { e.stopPropagation(); setZoom({ title: itemLabel(it), main: photos[it.id][0], colors: photos[it.id][1] }); }}
                      className="w-12 h-12 shrink-0 rounded border border-border bg-white object-contain cursor-zoom-in" />
                  )}
                  <span className="min-w-0 flex-1">{itemLabel(it)}{it.sub && !/^(Категория|Серия|Цвета|Вставки|Ответная)/.test(it.sub) && <span className="block text-[11px] text-muted-foreground truncate">{it.sub}</span>}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{money(it.price ?? 0)} / {it.unit || 'шт'}</span>
                </button>
              ))}
            </div>
          ))}
          {list.length > 400 && <p className="text-xs text-muted-foreground text-center">Показаны первые 400 — уточните поиск</p>}
        </div>
        )}
      </DialogContent>
      {zoom && <PhotoDialog {...zoom} onClose={() => setZoom(null)} />}
    </Dialog>
  );
}

// ─── Ручки: карточки с крупными фото, внутри — цвета, варианты и фурнитура серии ───
const ACCESSORY = /^\s*(завертка|розетка|накладка|цилиндр|планка|вставка|фиксатор)/i;
interface HandleCard { key: string; sheet: string; section: string; name: string; variants: Item[]; photo?: [string, Record<string, string>] }
function HandleGrid({ items, photos, onPick, onDetail }: { items: Item[]; photos: HandlePhotos; onPick: (it: Item) => void; onDetail: (v: boolean) => void }) {
  const [open, setOpenRaw] = useState<HandleCard | null>(null);
  const setOpen = (c: HandleCard | null) => { setOpenRaw(c); onDetail(!!c); };
  const [cur, setCur] = useState<string>('');
  const { brands, acc } = useMemo(() => {
    const cards = new Map<string, HandleCard>();
    const acc: Item[] = [];
    for (const it of items) {
      if (ACCESSORY.test(it.name)) { acc.push(it); continue; }
      const key = `${it.sheet}|${it.section}|${it.name.trim()}`;
      if (!cards.has(key)) cards.set(key, { key, sheet: it.sheet, section: it.section, name: it.name.trim(), variants: [], photo: photos[it.id] });
      const c = cards.get(key)!;
      c.variants.push(it);
      if (!c.photo && photos[it.id]) c.photo = photos[it.id];
    }
    const brands = new Map<string, HandleCard[]>();
    for (const c of cards.values()) { if (!brands.has(c.sheet)) brands.set(c.sheet, []); brands.get(c.sheet)!.push(c); }
    return { brands: [...brands.entries()], acc };
  }, [items, photos]);
  const brandName = (sheet: string) => (sheet === 'Дверные ручки Orange' ? 'Ручки Orange' : 'Ручки PROFILDOORS');
  const secName = (sec: string) => sec.replace(/^РУЧКИ\s*/i, '').replace(/,\s*ИТАЛИЯ|,\s*ГЕРМАНИЯ/i, '').toLowerCase();
  const variantName = (it: Item) => {
    const brand = it.attrs[it.attrs.length - 1] ?? '';
    return /PROFILDOORS/.test(brand) && it.attrs.length === 1 ? 'в покраске PROFILDOORS' : (brand && !/шт/.test(brand) ? brand : 'стандарт');
  };
  const accName = (a: Item) => `${a.name}${a.attrs.length === 1 && /PROFILDOORS/.test(a.attrs[0]) ? ' (покраска PROFILDOORS)' : ''}`;
  /** Завертка и розетка под цилиндр к ручке: по розетке (RO02, RO80, 277…) или из той же серии Orange */
  const accFor = (c: HandleCard) => {
    const ro = c.name.match(/\b(RO\d+|PL\d+)\b/i)?.[1] ?? c.name.match(/розетке\s+(\d{3})/i)?.[1];
    return acc.filter(a => a.sheet === c.sheet && (ro ? new RegExp(`\\b${ro}\\b`, 'i').test(a.name) : a.section === c.section));
  };
  if (open) {
    const ph = open.photo;
    const show = cur || ph?.[0] || '';
    const kitAcc = accFor(open);
    const kit = open.variants.find(v => v.attrs.length > 1)?.attrs[0];
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <button type="button" className="self-start text-sm text-primary hover:underline" onClick={() => { setOpen(null); setCur(''); }}>← ко всем ручкам</button>
        <div className="flex-1 min-h-0 overflow-y-auto grid md:grid-cols-[1.2fr_1fr] gap-4 pb-2">
          <div className="space-y-2">
            <div className="rounded-lg border border-border bg-white flex items-center justify-center h-[34vh] md:h-[56vh] p-2">
              {show ? <img src={show} alt="" referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" /> : <span className="text-sm text-muted-foreground">фото нет на сайте фабрики</span>}
            </div>
            {ph && Object.keys(ph[1]).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[['общее', ph[0]] as const, ...Object.entries(ph[1])].map(([c, u]) => (
                  <button key={c} type="button" onClick={() => setCur(u)} title={c}
                    className={`rounded-md border p-0.5 bg-white ${show === u ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary'}`}>
                    <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-16 h-16 object-contain" />
                    <span className="block text-[10px] text-center w-16 truncate">{c}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-lg font-semibold leading-tight">{open.name}</p>
              <p className="text-xs text-muted-foreground">{brandName(open.sheet)} · {secName(open.section)}</p>
              {kit && <p className="text-xs text-muted-foreground mt-1">В комплекте: {kit}</p>}
            </div>
            <div className="space-y-1.5">
              {open.variants.map(v => (
                <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <span className="text-sm">{variantName(v)}<span className="block text-xs text-muted-foreground">{money(v.price ?? 0)} / {v.unit || 'шт'}</span></span>
                  <Button size="sm" onClick={() => onPick(v)}><Plus size={14} className="mr-1" />Добавить</Button>
                </div>
              ))}
            </div>
            {kitAcc.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">К этой ручке</p>
                <div className="space-y-1">
                  {kitAcc.map(a => (
                    <div key={a.id} className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5">
                      {photos[a.id] ? <img src={photos[a.id][0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-12 h-12 shrink-0 object-contain bg-white rounded" /> : null}
                      <span className="flex-1 min-w-0 text-xs">{accName(a)}<span className="block text-muted-foreground">{money(a.price ?? 0)}</span></span>
                      <Button size="sm" variant="outline" onClick={() => onPick(a)}><Plus size={13} className="mr-1" />Добавить</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Окно не закрывается — можно сразу добавить ручку, завертку и розетку. Фото с сайта profildoors.ru; нужный цвет укажите в примечании к проёму.</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2 space-y-5 pb-2">
      {brands.length === 0 && acc.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Ничего не найдено</p>}
      {brands.map(([sheet, cards]) => (
        <div key={sheet}>
          <p className="text-sm font-semibold mb-2 sticky top-0 bg-background py-1 z-10">{brandName(sheet)} <span className="text-xs font-normal text-muted-foreground">· {cards.length}</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {cards.map(c => (
              <button key={c.key} type="button" onClick={() => { setOpen(c); setCur(''); }}
                className="rounded-lg border border-border bg-card p-2 text-left hover:border-primary hover:shadow-md transition flex flex-col gap-1">
                <span className="aspect-square rounded bg-white flex items-center justify-center overflow-hidden">
                  {c.photo ? <img src={c.photo[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-contain" /> : <span className="text-[11px] text-muted-foreground">нет фото</span>}
                </span>
                <span className="text-sm font-medium leading-tight line-clamp-2">{c.name.replace(/^ручка(\s+дверная)?\s+/i, '')}</span>
                <span className="text-[11px] text-muted-foreground leading-tight line-clamp-1">{secName(c.section)}</span>
                <span className="text-xs">{c.variants.length > 1 ? 'от ' : ''}<b>{money(Math.min(...c.variants.map(v => v.price ?? 0)))}</b>{c.photo && Object.keys(c.photo[1]).length ? <span className="text-muted-foreground"> · {Object.keys(c.photo[1]).length} цв.</span> : null}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {acc.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Завертки, розетки, цилиндры</p>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {acc.map(a => (
              <button key={a.id} type="button" onClick={() => onPick(a)} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-muted">
                {photos[a.id] ? <img src={photos[a.id][0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-10 h-10 shrink-0 object-contain bg-white rounded" /> : <Plus size={14} className="shrink-0 text-muted-foreground" />}
                <span className="flex-1 min-w-0">{accName(a)}</span>
                <span className="text-muted-foreground whitespace-nowrap">{money(a.price ?? 0)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Фото ручки крупно и в цветах (с profildoors.ru) */
function PhotoDialog({ title, main, colors, onClose }: { title: string; main: string; colors: Record<string, string>; onClose: () => void }) {
  const [cur, setCur] = useState(main);
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl w-[96vw]">
        <DialogHeader><DialogTitle className="text-base">{title}</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-border bg-white flex items-center justify-center h-[60vh] p-2">
          <img src={cur} alt="" referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" />
        </div>
        {Object.keys(colors).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[['общее', main] as const, ...Object.entries(colors)].map(([c, u]) => (
              <button key={c} type="button" onClick={() => setCur(u)} title={c}
                className={`rounded-md border p-0.5 bg-white ${cur === u ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary'}`}>
                <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-16 h-16 object-contain" />
                <span className="block text-[10px] text-center w-16 truncate">{c}</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Фото с сайта profildoors.ru.</p>
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
