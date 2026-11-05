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
export interface InfoList { type: string; items: string[] }
export interface InfoBlock { title: string; cat: number | null; insert: boolean; models?: string[]; lists: InfoList[] }
export interface SeriesInfo { profile: string[]; blocks: InfoBlock[]; sizes: string[]; h: [number, number] | null; w: [number, number] | null }
export interface Series { sheet: string; models: Model[]; height: Markup[]; width: Markup[]; options: number[]; info?: SeriesInfo }
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
export interface Line { itemId: number; qty: number; mods?: number[]; auto?: boolean; leavesOn?: number /** %-опция только на часть полотен проёма */ }

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
  openKind?: string;       // открывание: swing | slide | pivot | penal | magic | book
  hingeSys?: string;       // вариант открывания/петель из прайса серии (pd7000, e22, e30, krona…)
  leaves?: number;         // полотен в проёме (двустворчатые, раздвижные на 2–4 полотна); ширина — одного полотна
  finish?: string;         // покрытие / стекло / шпон (из списка категории)
  profile?: string;        // цвет алюминиевого профиля
  insert?: string;         // стекло или молдинг во вставке
  photo?: string;          // выбранное фото модели с profildoors.ru
  photoName?: string;      // точное название на сайте (например, «2.3SE»)
  leafSet?: LeafCfg[];     // по каждому полотну проёма: [0] — основное (модель/цвет в полях проёма), дальше — свои модель/цвет; сторона у всех
}

/** Полотно в проёме: своя модель/цвет (пусто — как у полотна 1) и сторона открывания */
export interface LeafCfg {
  model?: string;
  variantId?: number | null;
  finish?: string;
  insert?: string;
  photo?: string;
  photoName?: string;
  side?: 'L' | 'R';        // L — петли слева, R — петли справа
  height?: number;         // свой размер полотна (пусто — как у полотна 1)
  width?: number;
}
export const SIDE_LABEL: Record<'L' | 'R', string> = { L: 'левая (петли слева)', R: 'правая (петли справа)' };

/** Что стоит на полотне i: своё или как у полотна 1 */
export function leafOf(o: Opening, i: number): { model: string; variantId: number | null; finish?: string; insert?: string; photo?: string; photoName?: string; side?: 'L' | 'R'; height: number; width: number; ownSize: boolean; own: boolean } {
  const c = o.leafSet?.[i];
  const own = i > 0 && !!c?.model;
  const height = (i > 0 && c?.height) || o.height, width = (i > 0 && c?.width) || o.width;
  const ownSize = height !== o.height || width !== o.width;
  return own
    ? { model: c!.model!, variantId: c!.variantId ?? null, finish: c!.finish, insert: c!.insert, photo: c!.photo, photoName: c!.photoName, side: c!.side, height, width, ownSize, own }
    : { model: o.model, variantId: o.variantId, finish: i > 0 && c?.finish ? c.finish : o.finish, insert: i > 0 && c?.insert ? c.insert : o.insert, photo: o.photo, photoName: o.photoName, side: c?.side, height, width, ownSize, own: false };
}
/** Сумма ширин всех полотен проёма */
export function leavesWidth(o: Opening): number {
  let w = 0;
  for (let i = 0; i < Math.max(1, o.leaves || 1); i++) w += leafOf(o, i).width || 0;
  return w;
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
  leaves?: number;
  leafPrices?: { label: string; size: string; base: number; after: number; mk: string }[]; // когда у полотен разные модели или размеры
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
    const box = /^\s*Короб/i.test(it.name);
    return this.data.catalog.filter(x => x.kind === 'pct' && x.sheet === it.sheet && x.id !== it.id && (!door || x.section === it.section)
      // наценка за покрытие «Категория 2/3» — только на наличники и доборы; короб в цене прайса для любого покрытия
      && !(box && /погонаж/i.test(x.name) && /категори/i.test(x.name)));
  }
  /** Наценки, которые сами подходят по высоте/ширине полотна */
  autoMods(it: Item, height: number, width: number, leaves = 1, kind = 'swing', finishCat: number | null = null): number[] {
    const total = width * leaves;   // ширина проёма по полотнам
    return this.modsFor(it).filter(m => {
      const n = m.name.toLowerCase();
      // «Наценка на погонаж в покрытии "Категория 2 и 3"», «…в эмали на заказ "Категория 2"» — по выбранному покрытию полотна
      if (/погонаж/.test(n) && /категори/.test(n)) return finishCat != null && finishCat >= 2 && (n.match(/\d/g) ?? []).map(Number).includes(finishCat);
      // двустворчатый распашной проём: «Наценка за распашное исполнение», «Распашное исполнение короба до 2000 мм / свыше 2000 до 4000 мм»
      if (/распашн/.test(n) && /(исполнени|короб)/.test(n)) {
        if (leaves < 2 || kind !== 'swing') return false;
        const r0 = m.range;
        if (!r0) return true;
        return r0.min === r0.max ? total <= r0.max : total > r0.min && total <= r0.max;
      }
      const r = m.range; if (!r) return false;
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
    const leaves = Math.max(1, o.leaves || 1);
    out.leaves = leaves;
    out.base = vv.v.price;
    out.heightMk = pickMarkup(s.height, o.height, o.group);
    out.widthMk = pickMarkup(s.width, o.width, o.group);
    const k = (1 + (out.heightMk?.pct ?? 0) / 100) * (1 + (out.widthMk?.pct ?? 0) / 100);
    out.afterSize = out.base * k;                       // одно полотно с наценками
    // у полотен 2…N может быть своя модель — тогда и своя цена
    const mkTxt = (h: Markup | null, w: Markup | null) => [h && `выс. +${h.pct}%`, w && `шир. ${w.pct > 0 ? '+' : ''}${w.pct}%`].filter(Boolean).join(', ');
    let leafSum = out.afterSize;
    const lp = [{ label: vv.model.code, size: `${o.height}×${o.width}`, base: out.base, after: out.afterSize, mk: mkTxt(out.heightMk, out.widthMk) }];
    let differ = false;
    for (let i = 1; i < leaves; i++) {
      const lf = leafOf(o, i);
      const v2 = lf.own && lf.variantId != null ? idx.variant.get(lf.variantId) : undefined;
      const b2 = v2 ? v2.v.price : out.base;
      // свой размер полотна — свои наценки на высоту/ширину
      const hm = lf.ownSize ? pickMarkup(s.height, lf.height, o.group) : out.heightMk;
      const wm = lf.ownSize ? pickMarkup(s.width, lf.width, o.group) : out.widthMk;
      const k2 = (1 + (hm?.pct ?? 0) / 100) * (1 + (wm?.pct ?? 0) / 100);
      if (b2 !== out.base || lf.ownSize) differ = true;
      lp.push({ label: v2 ? v2.model.code : vv.model.code, size: `${lf.height}×${lf.width}`, base: b2, after: b2 * k2, mk: mkTxt(hm, wm) });
      leafSum += b2 * k2;
    }
    if (differ) out.leafPrices = lp;
    let door = leafSum;
    // зеркальная панель «плюсуется до наценки» — на столько полотен, сколько указано
    for (const { l, it } of opts) if (it.kind === 'price' && isMirror(it)) {
      const sum = (it.price ?? 0) * k * (l.qty || 1);
      out.fixedOptions.push({ item: it, qty: l.qty || 1, sum }); door += sum;
    }
    for (const { l, it } of opts) if (it.kind === 'pct') {
      const part = l.leavesOn != null ? Math.min(leaves, l.leavesOn) / leaves : 1;
      const sum = leafSum * part * (it.pct ?? 0) / 100;
      out.pctOptions.push({ item: it, sum }); door += sum;
    }
    for (const { l, it } of opts) if (it.kind === 'price' && !isMirror(it)) {
      const sum = (it.price ?? 0) * (l.qty || 1);
      out.fixedOptions.push({ item: it, qty: l.qty || 1, sum }); door += sum;
    }
    out.door = door;

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

// ─── Фото моделей с profildoors.ru ───────────────────────────────────────────
// src/data/door-photos.json: «название модели на сайте» (без пробелов, строчными) → превью 135×321.
let photoCache: Promise<Record<string, string>> | null = null;
export function loadPhotos(): Promise<Record<string, string>> {
  if (!photoCache) photoCache = import('@/data/door-photos.json').then(m => (m.default ?? m) as unknown as Record<string, string>).catch(() => ({}));
  return photoCache;
}

const SUFFIX: Record<string, string[]> = {
  AG: ['ag'], AGX: ['agx'], AGN: [''], AT: ['at'], SE: ['se'], ST: ['st'], VE: ['ve'], VT: ['vt'],
  'Под покраску': [''], 'PE.O, NE.O': ['pe.o', 'ne.o'], 'SE.O': ['se.o'], GE: ['ge'], 'P, N': ['p.o', 'n.o'], PD: ['pd'],
};

/** «2.1 - 2.4» → 2.1, 2.2, 2.3, 2.4; «3 - 7» → 3…7; «1.1.1 / 1.2.1» → оба; «1.1.2 (р.8 / р.15)» → 1.1.2(р.8), 1.1.2(р.15) */
export function expandModelCode(code: string): string[] {
  const c = code.trim();
  const par = c.match(/^(.+?)\s*\((.+)\)$/);
  if (par) {
    const bases = par[1].split('/').map(s => s.trim()).filter(Boolean);
    const tails = par[2].split('/').map(s => s.trim()).filter(Boolean);
    return bases.flatMap(b => tails.map(t => `${b}(${t})`));
  }
  return c.split('/').map(s => s.trim()).filter(Boolean).flatMap(tok => {
    const r = tok.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
    if (!r) return [tok];
    const a = r[1].split('.'), b = r[2].split('.');
    const prefix = a.slice(0, -1).join('.');
    const from = Number(a[a.length - 1]), to = Number(b[b.length - 1]);
    if (!(to >= from) || to - from > 20) return [tok];
    return Array.from({ length: to - from + 1 }, (_, i) => (prefix ? `${prefix}.` : '') + (from + i));
  });
}

/** Все фото модели (у кода вида «2.1 - 2.4» их несколько). wood=true — сначала NE.O / N.O (древесные) */
export function modelPhotos(photos: Record<string, string>, sheet: string, code: string, wood = false): { name: string; url: string }[] {
  const suf = SUFFIX[sheet];
  if (!suf) return [];
  const order = wood ? [...suf].reverse() : suf;
  const out: { name: string; url: string }[] = [];
  for (const m of expandModelCode(code)) {
    const base = m.toLowerCase().replace(/\s+/g, '');
    let hit: { name: string; url: string } | null = null;
    for (const s of order) {
      const key = /\(р\./.test(base) ? base : base + s;
      if (photos[key]) { hit = { name: m + (s ? s.toUpperCase() : ''), url: photos[key] }; break; }
    }
    if (!hit) {
      // нет точного фото: «2 AGN» → «2AGN ГЛЯНЕЦ», «2.2.2 (р.6)» → «2.2.2PD»
      const plain = base.replace(/\(.*\)$/, '');
      for (const s of order) {
        const k = Object.keys(photos).find(x => x === plain + s || x.startsWith(plain + s));
        if (k) { hit = { name: m + (s ? s.toUpperCase() : ''), url: photos[k] }; break; }
      }
    }
    if (hit) out.push(hit);
  }
  return out;
}

// ─── Подсказки по серии ──────────────────────────────────────────────────────
const modelBase = (code: string) => code.trim().split(/[\s/(]/)[0];

/** Блоки покрытий/стёкол для выбора отделки (без вставок) */
export const finishBlocks = (s: Series) => (s.info?.blocks ?? []).filter(b => !b.insert && b.lists.length);

/** Вставки (стекло/молдинг), которые относятся к выбранной модели */
export function insertBlocks(s: Series, model: string, variantLabel = ''): InfoBlock[] {
  const base = modelBase(model);
  return (s.info?.blocks ?? []).filter(b => {
    if (!b.insert) return false;
    if (b.models?.length) return b.models.some(m => m === base || model.includes(m));
    const glass = /стекл/i.test(b.title), mold = /молдинг/i.test(b.title);
    return (glass && /стекл/i.test(variantLabel)) || (mold && /молдинг/i.test(variantLabel));
  });
}

/** Номер категории, в которой есть такое покрытие/стекло */
export function finishCategory(s: Series, finish: string): number | null {
  for (const b of finishBlocks(s)) if (b.lists.some(l => l.items.includes(finish))) return b.cat;
  return null;
}

/** Опция-наценка за категорию покрытия («Наценка за покрытия Категория 2 и 3», «выкрас эмали под заказ (Категория 2)») */
export function categoryOption(idx: PriceIndex, s: Series, cat: number): Item | null {
  for (const id of s.options) {
    const it = idx.byId.get(id);
    if (!it) continue;
    if (!/категори/i.test(it.name) || /погонаж|короб|наличник|добор|планк|плинтус/i.test(it.name)) continue;
    const nums = (it.name.match(/\d/g) ?? []).map(Number);
    if (nums.includes(cat)) return it;
  }
  return null;
}


// ─── Фото по цвету / стеклу и образцы цветов (profildoors.ru) ────────────────
// src/data/door-colors.json: { m: { «модель» : [фото по умолчанию, { «цвет/стекло»: фото }] }, s: { «серия»: { «цвет»: образец } } }
// Пути сжаты: «w:» = /upload/dev2fun.imagecompress/webp/resize_cache/iblock/, «r:» = /upload/resize_cache/iblock/, «|» = /201_490_…/
/** m: модель → [фото по умолчанию, {цвет: фото}, {стекло: фото}?]; s: серия(:profile|:glass) → {название: образец} */
export interface ColorData { m: Record<string, [string, Record<string, string>, Record<string, string>?]>; s: Record<string, Record<string, string>> }
let colorCache: Promise<ColorData> | null = null;
export function loadColors(): Promise<ColorData> {
  if (!colorCache) colorCache = import('@/data/door-colors.json').then(m => (m.default ?? m) as unknown as ColorData).catch(() => ({ m: {}, s: {} }));
  return colorCache;
}
const SITE_URL = 'https://profildoors.ru';
export function colorUrl(p: string): string {
  if (!p) return '';
  if (p.startsWith('http')) return p;
  const x = p.replace(/^w:/, '/upload/dev2fun.imagecompress/webp/resize_cache/iblock/').replace(/^r:/, '/upload/resize_cache/iblock/').replace('|', '/201_490_140cd750bba9870f18aada2478b24840a/');
  return SITE_URL + (x.startsWith('/') ? x : '/' + x);
}
/** «Шпон Натуральный Дуб» = «Натуральный Дуб», «Лайт Грей "Элегант"» = «Лайт Грей Элегант», «Светло-серый» = «Лайт Грей» */
export function colorKey(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/["«»]/g, '').replace(/\(.*?\)/g, '').replace(/^шпон\s+/, '')
    .replace('светло-серый', 'лайт грей').replace(/\s+/g, ' ').trim();
}
/** Фото модели в выбранном цвете/стекле; null — такого фото на сайте нет */
export function modelColorPhoto(c: ColorData, modelName: string, finish?: string, insert?: string): string | null {
  const rec = c.m[modelName.toLowerCase().replace(/\s+/g, '')];
  if (!rec) return null;
  const find = (map: Record<string, string> | undefined, name?: string) => {
    if (!map || !name) return null;
    const k = colorKey(name);
    const hit = Object.entries(map).find(([n]) => colorKey(n) === k) ?? Object.entries(map).find(([n]) => k.includes(colorKey(n)) || colorKey(n).includes(k));
    return hit && hit[1] ? colorUrl(hit[1]) : null;
  };
  return find(rec[1], finish) ?? find(rec[2], insert) ?? find(rec[2], finish);
}
export function modelDefaultPhoto(c: ColorData, modelName: string): string | null {
  const rec = c.m[modelName.toLowerCase().replace(/\s+/g, '')];
  return rec?.[0] ? colorUrl(rec[0]) : null;
}
/** Образец цвета (кружок) для серии */
export function swatchFor(c: ColorData, sheet: string, name: string): string | null {
  const keys = sheet === 'PE.O, NE.O' ? ['PE.O', 'NE.O'] : sheet === 'P, N' ? ['P.O', 'N.O'] : sheet === 'Под покраску' ? ['PAINT'] : sheet === 'Серия FT EI30' ? ['SE', 'VE'] : [sheet];
  const k = colorKey(name);
  for (const tab of ['', ':glass', ':profile']) for (const s of keys) for (const [n, u] of Object.entries(c.s[s + tab] ?? {})) if (colorKey(n) === k) return colorUrl(u);
  // у серии своих образцов нет (PD, P/N…) — те же эмали фабрики берём из других серий
  for (const [sk, m] of Object.entries(c.s)) if (!sk.includes(':')) for (const [n, u] of Object.entries(m)) if (colorKey(n) === k) return colorUrl(u);
  return null;
}
