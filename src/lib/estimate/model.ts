import { SERIES, calcDoor, type Series } from './doors';
import { CATALOG, type CatalogItem } from './accessories';
import { frameLines, systemLines, frameLineSum, defaultFrame, type FrameSpec, type FrameCtx } from './frame';

/** Строка комплектующих / фурнитуры (цена фиксируется в момент выбора) */
export interface Line {
  id: string;
  itemId?: string;           // из каталога; пусто — своя позиция
  kind: string;              // «Короб», «Наличник», «Ручки» …
  name: string;
  spec?: string;
  unit: string;
  price: number;
  qty: number;
  maker?: string;
}

export interface DoorSpec {
  seriesId: string;
  modelIdx: number;          // индекс строки в series.models
  modelName?: string;        // точное название модели для КП (например «1.2.2 PD»)
  modelKey?: string;         // выбранная модель из галереи (адрес на сайте или подпись строки прайса)
  perl: boolean;
  color: string;             // название цвета для КП
  colorId?: string;          // код цвета (white, graphite …)
  photo?: string;            // ссылка на фото для КП
  edgeColor?: string;        // цвет алюминиевой кромки (PE.O / NE.O)
  height: number;
  width: number;
  thickness?: string;
  options: string[];
}

export interface LeafSize { h: number; w: number }

export interface Opening {
  id: string;
  room: string;
  openType: string;          // Распашная, Купе, Пенал …
  qty: number;               // одинаковых проёмов
  leaves?: number;           // полотен в проёме: 1, для двустворчатой 2 или 4
  leafSizes?: LeafSize[];    // свои размеры каждого полотна (если не заданы — общий размер двери)
  door?: DoorSpec;
  frame?: FrameSpec;          // короб, наличники, доборы — подбираются автоматически
  transom?: { idx: number; area: number }; // верхняя фрамуга-дверь, м²
  lines: Line[];
}

export interface EstimateData {
  openings: Opening[];
  hardware: Line[];
  discountPct?: number;
  note?: string;
  date?: string;
}

export const OPEN_TYPES = ['Распашная', 'Распашная двустворчатая', 'Reverse', 'Купе', 'Купе Invisible', 'Пенал K-PUSH', 'Книжка', 'Рото (поворотная)', 'Compack', 'Magic', 'Pivot'];
/** Системы открывания, которые фабрика указывает для серии (profildoors.ru, вкладка «Системы открывания») */
const OPEN_BY_SERIES: Record<string, string[]> = {
  PD: ['Распашная', 'Распашная двустворчатая', 'Купе', 'Пенал K-PUSH', 'Книжка', 'Рото (поворотная)'],
  EO: ['Распашная', 'Распашная двустворчатая', 'Reverse', 'Купе', 'Купе Invisible', 'Пенал K-PUSH', 'Книжка', 'Compack', 'Magic', 'Pivot'],
  O: ['Распашная', 'Распашная двустворчатая', 'Купе', 'Пенал K-PUSH', 'Книжка'],
};
const OPEN_GROUP: Record<string, string> = {
  PD: 'PD', PM: 'PD', PE: 'EO', PEO_IE: 'EO', PEO_UN: 'EO', NEO_T: 'EO', NEO_NT: 'EO', PAINT: 'EO',
  PDO_IE: 'O', PDO_UN: 'O', PO_IE: 'O', PO_UN: 'O', NDO: 'O', NO_T: 'O', NO_NT: 'O',
};
export function openTypesFor(seriesId: string | undefined, current?: string): string[] {
  const list = OPEN_BY_SERIES[OPEN_GROUP[seriesId ?? ''] ?? ''] ?? OPEN_TYPES;
  return current && !list.includes(current) ? [...list, current] : list;
}
/** Цвет алюминиевой кромки (профиля) у каркасных PE.O / NE.O — по сайту фабрики */
export const EDGE_COLORS = ['Вайт', 'Серебро', 'Черный', 'Никель', 'Шампань'];
export const hasEdge = (seriesId: string | undefined) => ['PEO_IE', 'PEO_UN', 'NEO_T', 'NEO_NT', 'PE', 'PAINT'].includes(seriesId ?? '');

export const uid = () => Math.random().toString(36).slice(2, 10);
export const seriesById = (id: string | undefined): Series | undefined => SERIES.find(s => s.id === id);
export const catalogById = (id: string | undefined): CatalogItem | undefined => CATALOG.find(c => c.id === id);

export function newOpening(n: number): Opening {
  return { id: uid(), room: `Проём ${n}`, openType: 'Распашная', qty: 1, lines: [], frame: defaultFrame('PDO_IE'),
    door: { seriesId: 'PDO_IE', modelIdx: 0, perl: false, color: 'Вайт', colorId: 'white', height: 2000, width: 800, options: [] } };
}

export function doorUnit(d: DoorSpec | undefined) {
  if (!d) return null;
  const s = seriesById(d.seriesId);
  const m = s?.models[d.modelIdx];
  if (!s || !m) return { ok: false as const, error: 'Выберите серию и модель' };
  return { ...calcDoor(s, m.price, d.height, d.width, d.perl && !!s.perl, d.options), series: s, model: m };
}

export function transomUnit(o: Opening) {
  const s = seriesById(o.door?.seriesId);
  const t = o.transom ? s?.transoms?.[o.transom.idx] : undefined;
  if (!t || !o.transom) return null;
  const perm2 = o.door?.perl && t.perl ? t.perl : t.base;
  return { label: t.label, perm2, sum: Math.round(perm2 * o.transom.area * 100) / 100 };
}

export const isDouble = (openType: string) => /двуствор/i.test(openType);
/** Сколько полотен в одном проёме */
/** Сколько полотен можно выбрать для вида открывания */
export function leafChoices(openType: string): number[] {
  if (isDouble(openType)) return [2, 4];
  if (/^купе/i.test(openType)) return [1, 2];
  if (/compack/i.test(openType)) return [2];
  return [1];
}
export const leavesOf = (o: Pick<Opening, 'leaves' | 'openType'>) => {
  const ch = leafChoices(o.openType);
  return o.leaves && ch.includes(o.leaves) ? o.leaves : ch[0];
};

/** Размеры каждого полотна проёма */
export function leafSizes(o: Opening): LeafSize[] {
  const d = o.door;
  if (!d) return [];
  const n = leavesOf(o);
  if (n === 1) return [{ h: d.height, w: d.width }];
  return Array.from({ length: n }, (_, i) => ({ h: o.leafSizes?.[i]?.h || d.height, w: o.leafSizes?.[i]?.w || d.width }));
}
/** Цена каждого полотна по его размеру */
/** Цена каждого полотна. В двустворчатом проёме половина полотен — ответные B-полотна
 *  (по прайсу: врезка под ответную планку, ригель и притворные планки), без комплектации замка. */
export function leafUnits(o: Opening) {
  const sizes = leafSizes(o);
  const n = sizes.length;
  const base = o.door?.options ?? [];
  return sizes.map((sz, i) => {
    const isB = n > 1 && isDouble(o.openType) && i >= Math.ceil(n / 2);
    const options = n > 1 && isDouble(o.openType) ? base.filter(x => x !== 'v' && !(isB && x.startsWith('lk_'))).concat(isB ? ['v'] : []) : base;
    return { ...sz, isB, calc: doorUnit({ ...o.door!, height: sz.h, width: sz.w, options }) };
  });
}

export function frameCtx(o: Opening): FrameCtx {
  const sizes = leafSizes(o);
  return {
    seriesId: o.door?.seriesId ?? '', perl: !!o.door?.perl,
    doorH: Math.max(0, ...sizes.map(x => x.h)), leavesW: sizes.reduce((a, x) => a + x.w, 0),
    double: isDouble(o.openType), reverse: /reverse/i.test(o.openType), openType: o.openType,
    leafPrices: leafUnits(o).map(u => (u.calc && u.calc.ok ? u.calc.unit ?? 0 : 0)), leafWidths: sizes.map(x => x.w),
  };
}
/** Короб, наличники, доборы проёма + комплект системы открывания */
export const openingFrame = (o: Opening) => { const x = frameCtx(o); return [...systemLines(o.frame, x), ...frameLines(o.frame, x)]; };

export function openingTotal(o: Opening): number {
  const door = leafUnits(o).reduce((a, l) => a + (l.calc && l.calc.ok && l.calc.unit ? l.calc.unit : 0), 0);
  const tr = transomUnit(o)?.sum ?? 0;
  const lines = o.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const frame = openingFrame(o).reduce((s, l) => s + frameLineSum(l), 0);
  return (door + tr + frame + lines) * (o.qty || 0);
}

export function totals(e: EstimateData) {
  const doors = e.openings.reduce((s, o) => s + openingTotal(o), 0);
  const hardware = e.hardware.reduce((s, l) => s + l.price * l.qty, 0);
  const sum = doors + hardware;
  const discount = e.discountPct ? Math.round(sum * e.discountPct) / 100 : 0;
  return { doors, hardware, sum, discount, total: Math.round((sum - discount) * 100) / 100 };
}

export function lineFromCatalog(c: CatalogItem): Line {
  return { id: uid(), itemId: c.id, kind: c.section, name: c.name, spec: c.spec, unit: c.unit, price: c.price, qty: 1, maker: c.maker };
}

// ── Ограничения фабрики (прайс май 2026) ───────────────────────────────────
const num = (name: string) => (name.match(/^\s*(\d+(?:\.\d+)*)/)?.[1] ?? '');
const inList = (code: string, list: string[]) => list.includes(code);
const peRange = (n: number) => [2, 3, 4, 6, 7, 8, 10, 25, 26, 27, 28, 30, 31, 32, 34, 36, 37].includes(n);

/** Предупреждения: модель не делается в такой системе / цвете / высоте */
export function openingWarnings(o: Opening, modelName: string | undefined, colorId: string | undefined): string[] {
  const d = o.door; if (!d) return [];
  const sid = d.seriesId; const code = num(modelName ?? '');
  const t = o.openType.toLowerCase();
  const w: string[] = [];
  const sliding = t.startsWith('купе') || t.startsWith('пенал');
  const folding = t === 'книжка';
  if (/^(PO|NO)_/.test(sid)) {
    if (sliding && inList(code, ['1.2', '1.7', '1.13'])) w.push(`Модель ${code} не изготавливается в раздвижных системах`);
    if (folding && inList(code, ['1.2', '1.7', '1.12', '1.13'])) w.push(`Модель ${code} не изготавливается в складной системе «Книжка»`);
  }
  if (/^(PDO|NDO)/.test(sid) && folding && /^(6|7|8)\./.test(code)) w.push('Модели 6.x.x, 7.x.x, 8.x.x не изготавливаются в складной системе');
  if (sid === 'PD' && folding && inList(code, ['2.7.1', '2.7.2', '1.8.1', '1.8.2'])) w.push(`Модель ${code} PD не изготавливается в складной системе`);
  if (t === 'compack') {
    const n = Number(code.split('.')[0]);
    if ((sid === 'PE' && peRange(n)) || (/^(PEO|NEO)/.test(sid) && n >= 41)) w.push(`Система COMPACK не производится в модели ${code}`);
  }
  if (colorId?.endsWith('_elegant')) {
    if (/^(PEO)/.test(sid) && code !== '1') w.push('В покрытии «Элегант» (категория 3) изготавливается только модель 1 PE.O');
    if (sid === 'PO_IE' && code === '1.12') w.push('Модель 1.12 P.O не производится в покрытии «Элегант»');
  }
  const h = Math.max(...leafSizes(o).map(x => x.h));
  if (/^(PEO|NEO|PAINT)/.test(sid)) {
    const ft = o.frame?.type;
    if ((ft === 'copl' || ft === 'tele') && h > 2300) w.push('С обычным коробом серии полотна PE.O/NE.O делаются до 2300 мм — выше нужен моноблок (до 2700) или Invisible (до 3000)');
    if (ft === 'mono' && h > 2700) w.push('С моноблоком полотна делаются до 2700 мм — выше только с коробом Invisible');
  }
  const wMax = Math.max(...leafSizes(o).map(x => x.w));
  if (wMax > 1000 && !(sliding || t === 'pivot')) w.push('Ширина больше 1000 мм — только для раздвижных систем и Pivot');
  if (sid === 'PE' && h > 2700 && o.frame?.type !== 'invisible') w.push('Полотна PE выше 2700 мм делаются только с коробом Invisible');
  if (/reverse/i.test(o.openType) && leafSizes(o).length > 1 && o.frame?.type === 'mono') w.push('Моноблок внутреннего открывания не производится к двустворчатым дверям');
  return w;
}
