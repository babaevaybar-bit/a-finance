/**
 * Прайс PROFILDOORS (Казахстан) и расчёт по его правилам.
 * Данные — src/data/price.json, собираются скриптом scripts/parse_price.py из выгрузки Google-таблицы.
 *
 * Как считается полотно (так написано в прайсе):
 *   1) цена модели в выбранном покрытии/категории (+ зеркальная панель — «плюсуется до наценки»);
 *   2) наценка на высоту, затем к полученной сумме — наценка на ширину;
 *   3) процентные опции (например, «выкрас эмали под заказ +30%») — от суммы после наценок;
 *   4) затем плюсуются остальные опции (замок, Reverse, порог, доводчик…);
 *   5) короб, петли, ручки, системы и прочее — отдельными позициями из прайса.
 */

export interface Range { min: number; max: number; strict: boolean; below?: boolean }
export interface Markup { id: number; name: string; pct: number; range: Range | null; group: string }
export interface Variant { id: number; label: string; price: number; unit: string }
export interface Model { code: string; variants: Variant[] }
export interface Series { sheet: string; models: Model[]; height: Markup[]; width: Markup[]; options: number[] }
export interface Item {
  id: number; sheet: string; section: string; sub: string; name: string; attrs: string[];
  unit: string; price: number | null; pct: number | null; kind: 'price' | 'pct'; range?: Range | null;
}
export interface PriceData { title: string; series: Series[]; catalog: Item[] }

let cache: Promise<PriceData> | null = null;
export function loadPrice(): Promise<PriceData> {
  if (!cache) cache = import('@/data/price.json').then(m => (m.default ?? m) as unknown as PriceData);
  return cache;
}

export const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`;
export const itemLabel = (it: Item) => [it.name, ...it.attrs].filter(Boolean).join(' · ');

/** Строка расчёта: позиция прайса × количество (+ процентные наценки из того же раздела прайса) */
export interface Line { itemId: number; qty: number; mods?: number[] }

export interface Opening {
  id: string;
  room: string;            // где: «Спальня», «Санузел»…
  qty: number;             // одинаковых проёмов
  sheet: string;           // серия (лист прайса)
  model: string;           // код модели
  variantId: number | null;
  group: string;           // вид полотна для наценок (стандартное, E-, F-, G-полотно)
  height: number;
  width: number;
  color: string;           // цвет/покрытие — текстом, для КП
  options: Line[];         // опции полотна из этого же листа
  extras: Line[];          // короб, петли, замок, ручка, система… — из любого листа
  note: string;
}

export interface EstimateData {
  openings: Opening[];
  items: Line[];           // общие позиции (плинтус, панели, ручки отдельно…)
  discountPct: number;
  comment: string;
}

export const emptyEstimate = (): EstimateData => ({ openings: [], items: [], discountPct: 0, comment: '' });

export function newOpening(sheet = '', room = ''): Opening {
  return {
    id: Math.random().toString(36).slice(2, 10), room, qty: 1, sheet, model: '', variantId: null, group: '',
    height: 2000, width: 800, color: '', options: [], extras: [], note: '',
  };
}

/** Подходящая наценка по размеру: последняя, чей «от» не больше размера. Шаг 50 мм — промежутки между диапазонами относим к нижнему. */
export function pickMarkup(list: Markup[], value: number, group = ''): Markup | null {
  const own = list.filter(m => m.range && (m.group || '') === (group || ''));
  const pool = own.length ? own : list.filter(m => m.range && !m.group);
  const below = pool.find(m => m.range!.below && value < m.range!.max);
  if (below) return below;
  let hit: Markup | null = null;
  for (const m of [...pool].filter(m => !m.range!.below).sort((a, b) => a.range!.min - b.range!.min)) {
    const r = m.range!;
    const ok = r.strict ? value > r.min : value >= r.min;
    if (ok) hit = m;
  }
  return hit;
}

export interface Breakdown {
  ok: boolean;
  error?: string;
  base: number;            // цена модели (+ зеркало)
  heightMk: Markup | null;
  widthMk: Markup | null;
  afterSize: number;
  pctOptions: { item: Item; sum: number }[];
  fixedOptions: { item: Item; qty: number; sum: number }[];
  door: number;            // одно полотно со всеми опциями
  extras: { item: Item; qty: number; unit: number; sum: number; mods: Item[] }[];
  extrasSum: number;       // на один проём
  unit: number;            // один проём целиком
  total: number;           // × количество проёмов
  warnings: string[];
}

export class PriceIndex {
  byId = new Map<number, Item>();
  series = new Map<string, Series>();
  variant = new Map<number, { series: Series; model: Model; v: Variant }>();
  constructor(public data: PriceData) {
    for (const it of data.catalog) this.byId.set(it.id, it);
    for (const s of data.series) {
      this.series.set(s.sheet, s);
      for (const m of s.models) for (const v of m.variants) this.variant.set(v.id, { series: s, model: m, v });
    }
  }
  /** Процентные наценки того же листа и раздела, которые можно применить к позиции (например, «короб для полотна свыше 2400 мм +30%») */
  modsFor(it: Item): Item[] {
    const door = this.series.has(it.sheet);   // в листах серий разделы разные (погонаж, опции) — берём только свой раздел
    return this.data.catalog.filter(x => x.kind === 'pct' && x.sheet === it.sheet && x.id !== it.id && (!door || x.section === it.section));
  }
  /** Наценки, которые сами подходят по высоте/ширине полотна */
  autoMods(it: Item, height: number, width: number): number[] {
    return this.modsFor(it).filter(m => {
      const r = m.range; if (!r) return false;
      const n = m.name.toLowerCase();
      // «к полотну шириной 1000 мм» — по ширине полотна; «для полотна свыше 2400 мм до 3000 мм» — по высоте.
      // Длина короба/погонажа и распашное исполнение по размеру полотна однозначно не определяются — их отмечает менеджер.
      if (/полотн\S* шириной/.test(n)) return r.min === r.max ? width >= r.min : (r.strict ? width > r.min : width >= r.min) && width <= r.max;
      if (/для полотна (свыше|от|до)/.test(n) && !/фрамуг/.test(n)) return (r.strict ? height > r.min : height >= r.min) && height <= r.max;
      return false;
    }).map(m => m.id);
  }
}

const isMirror = (it: Item) => /зеркальн/i.test(it.name);

export function lineSum(idx: PriceIndex, l: Line) {
  const it = idx.byId.get(l.itemId);
  if (!it || it.kind !== 'price') return { item: it, unit: 0, sum: 0, mods: [] as Item[] };
  const mods = (l.mods ?? []).map(id => idx.byId.get(id)).filter((x): x is Item => !!x && x.kind === 'pct');
  const k = mods.reduce((a, m) => a * (1 + (m.pct ?? 0) / 100), 1);
  const unit = (it.price ?? 0) * k;
  return { item: it, unit, sum: unit * (l.qty || 0), mods };
}

export function calcOpening(idx: PriceIndex, o: Opening): Breakdown {
  const out: Breakdown = {
    ok: false, base: 0, heightMk: null, widthMk: null, afterSize: 0, pctOptions: [], fixedOptions: [],
    door: 0, extras: [], extrasSum: 0, unit: 0, total: 0, warnings: [],
  };
  const vv = o.variantId != null ? idx.variant.get(o.variantId) : undefined;
  if (vv) {
    const s = vv.series;
    const opts = o.options.map(l => ({ l, it: idx.byId.get(l.itemId) })).filter(x => x.it) as { l: Line; it: Item }[];
    out.base = vv.v.price;
    for (const { l, it } of opts) if (it.kind === 'price' && isMirror(it)) out.base += (it.price ?? 0) * (l.qty || 1);
    out.heightMk = pickMarkup(s.height, o.height, o.group);
    out.widthMk = pickMarkup(s.width, o.width, o.group);
    out.afterSize = out.base * (1 + (out.heightMk?.pct ?? 0) / 100) * (1 + (out.widthMk?.pct ?? 0) / 100);
    let door = out.afterSize;
    for (const { it } of opts) if (it.kind === 'pct') {
      const sum = out.afterSize * (it.pct ?? 0) / 100;
      out.pctOptions.push({ item: it, sum }); door += sum;
    }
    for (const { l, it } of opts) if (it.kind === 'price' && !isMirror(it)) {
      const sum = (it.price ?? 0) * (l.qty || 1);
      out.fixedOptions.push({ item: it, qty: l.qty || 1, sum }); door += sum;
    }
    for (const { l, it } of opts) if (it.kind === 'price' && isMirror(it)) out.fixedOptions.push({ item: it, qty: l.qty || 1, sum: 0 });
    out.door = door;
    const hs = s.height.filter(m => m.range).map(m => m.range!.max);
    if (hs.length && o.height > Math.max(...hs)) out.warnings.push(`Высота ${o.height} мм больше, чем есть в наценках серии (до ${Math.max(...hs)} мм) — проверьте, производится ли`);
  } else if (o.sheet) {
    out.error = 'Выберите модель';
  }
  for (const l of o.extras) {
    const r = lineSum(idx, l);
    if (!r.item) continue;
    out.extras.push({ item: r.item, qty: l.qty, unit: r.unit, sum: r.sum, mods: r.mods });
    out.extrasSum += r.sum;
  }
  out.unit = out.door + out.extrasSum;
  out.total = out.unit * Math.max(0, o.qty || 0);
  out.ok = !!vv || o.extras.length > 0;
  return out;
}

export function calcEstimate(idx: PriceIndex, e: EstimateData) {
  const openings = e.openings.map(o => ({ o, b: calcOpening(idx, o) }));
  const items = e.items.map(l => ({ l, ...lineSum(idx, l) })).filter(x => x.item);
  const sub = openings.reduce((s, x) => s + x.b.total, 0) + items.reduce((s, x) => s + x.sum, 0);
  const discount = sub * Math.max(0, Math.min(100, e.discountPct || 0)) / 100;
  return { openings, items, sub, discount, total: sub - discount };
}

/** Сколько петель по правилам прайса (подсказка, менеджер может поправить) */
export function suggestHinges(hingeName: string, sheet: string, model: string, height: number, width: number, extraLoad: boolean): number | null {
  const n = hingeName.toLowerCase();
  const agn = /agn/i.test(sheet) || /agn/i.test(model);
  const plusOne = (width >= 1000 || extraLoad) ? 1 : 0;
  if (n.includes('aldeghi')) return null;                     // в AG/AT петли уже в цене полотна
  if (n.includes('2780') || n.includes('2760')) {
    if (sheet === 'ST' && n.includes('2780')) return 2;
    return height <= 2400 ? 2 : 3;
  }
  if (agn && (n.includes('eclipse') || n.includes('pd3000'))) {
    return height <= 2150 ? 3 : height <= 2450 ? 4 : height <= 3000 ? 5 : 6;
  }
  if (n.includes('pd7000')) return (height <= 2250 ? 2 : height <= 2350 ? 3 : 4) + plusOne;
  if (n.includes('pd3000') || n.includes('eclipse')) {
    return (height <= 2250 ? 2 : height <= 2300 ? 3 : height < 3000 ? 4 : 5) + plusOne;
  }
  if (sheet === 'P, N' || sheet === 'PD') return height <= 2250 ? 2 : 3;
  if (n.includes('петл')) return (height <= 2250 ? 2 : height <= 2350 ? 3 : 4) + plusOne;
  return null;
}

/** Нужна ли +1 петля: шумоизоляция или зеркало */
export const hasExtraLoad = (idx: PriceIndex, o: Opening) =>
  o.options.some(l => { const it = idx.byId.get(l.itemId); return !!it && /(шумоизоляц|зеркальн)/i.test(it.name); });
