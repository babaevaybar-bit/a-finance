import { SERIES, calcDoor, type Series } from './doors';
import { CATALOG, type CatalogItem } from './accessories';
import { frameLines, frameLineSum, defaultFrame, type FrameSpec, type FrameCtx } from './frame';

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
  EO: ['Распашная', 'Распашная двустворчатая', 'Reverse', 'Купе', 'Купе Invisible', 'Пенал K-PUSH'],
  O: ['Распашная', 'Распашная двустворчатая'],
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
export const leavesOf = (o: Pick<Opening, 'leaves' | 'openType'>) => o.leaves ?? (isDouble(o.openType) ? 2 : 1);

/** Размеры каждого полотна проёма */
export function leafSizes(o: Opening): LeafSize[] {
  const d = o.door;
  if (!d) return [];
  const n = leavesOf(o);
  if (n === 1) return [{ h: d.height, w: d.width }];
  return Array.from({ length: n }, (_, i) => ({ h: o.leafSizes?.[i]?.h || d.height, w: o.leafSizes?.[i]?.w || d.width }));
}
/** Цена каждого полотна по его размеру */
export function leafUnits(o: Opening) {
  return leafSizes(o).map(sz => ({ ...sz, calc: doorUnit({ ...o.door!, height: sz.h, width: sz.w }) }));
}

export function frameCtx(o: Opening): FrameCtx {
  const sizes = leafSizes(o);
  return {
    seriesId: o.door?.seriesId ?? '', perl: !!o.door?.perl,
    doorH: Math.max(0, ...sizes.map(x => x.h)), leavesW: sizes.reduce((a, x) => a + x.w, 0),
    double: sizes.length > 1, reverse: /reverse/i.test(o.openType),
  };
}
/** Короб, наличники, доборы проёма */
export const openingFrame = (o: Opening) => frameLines(o.frame, frameCtx(o));

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
