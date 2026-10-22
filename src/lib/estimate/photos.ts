/**
 * Фото дверей с profildoors.ru (каталог ORANGE) — ссылки собраны в таблицу door_photo_catalog.
 * Картинки грузятся прямо с сайта фабрики, у нас хранятся только пути.
 */
import type { Series, ModelPrice } from './doors';

const SITE = 'https://profildoors.ru';

interface SiteSeries { colors: { x: string; sw: string }[]; models: Record<string, Record<string, string>> }
export interface PhotoCatalog { site: string; series: Record<string, SiteSeries> }

/** Компактный путь → ссылка на превью (166×405) и на оригинал */
export function photoUrls(p: string | undefined) {
  if (!p) return null;
  const webp = p.startsWith('w');
  const rest = webp ? p.slice(1) : p;
  const cut = rest.lastIndexOf('/');
  const dir = rest.slice(0, cut), file = rest.slice(cut + 1);
  const root = webp ? `${SITE}/upload/dev2fun.imagecompress/webp/` : `${SITE}/upload/`;
  return { thumb: `${root}resize_cache/iblock/${dir}/166_405_1/${file}`, full: `${root}iblock/${dir}/${file}` };
}

// ── Цвета ──────────────────────────────────────────────────────────────────
export interface ColorDef { id: string; name: string; perl?: boolean; hex: string }
const C = (id: string, name: string, hex: string, perl = false): ColorDef => ({ id, name, hex, perl });
const BASE = [
  C('white', 'Вайт', '#f4f4f1'), C('cream_white', 'Крем Вайт', '#efe9dc'), C('creamy_magnolia', 'Кремовая Магнолия', '#e9dfcb'),
  C('sand_2', 'Сэнд', '#cdbfa8'), C('light_grey', 'Лайт Грей', '#cfd0cc'), C('smokey', 'Смоки', '#8f8b84'),
  C('graphite', 'Графит', '#4b4c4d'), C('black', 'Блэк', '#232323'),
];
const PEARL = [C('pearl_white', 'Перламутр белый', '#ece9e2', true), C('pearl_bronze', 'Перламутр бронза', '#8a7663', true)];
const ELEGANT = [
  C('pearl_white_elegant', 'Перламутр белый Элегант', '#e6e1d6', true), C('light_gray_elegant', 'Лайт Грей Элегант', '#c9c9c4', true),
  C('pearl_bronze_elegant', 'Перламутр бронза Элегант', '#7e6a58', true), C('graphite_elegant', 'Графит Элегант', '#4a4a4a', true),
  C('black_elegant', 'Блэк Элегант', '#1f1f1f', true),
];
const UNILACK = [C('alaska', 'Аляска', '#f6f6f3'), C('dark_whaite', 'Дарк Вайт', '#ecebe6'), C('magnolia', 'Магнолия', '#ece4d3'), C('grey_', 'Грей', '#a7a7a3')];
const WOOD_T = [C('oak_natural', 'Дуб натуральный', '#b98d5c'), C('oak_mokko', 'Дуб Мокко', '#6b4b36'), C('nut_chocolate', 'Орех шоколад', '#4a3326')];
const WOOD_NT = [C('oak_caramel', 'Дуб Карамель', '#b07a45'), C('oak_sonoma', 'Дуб Сонома', '#c8a77d'), C('oak_tobacco', 'Дуб Тобакко', '#6e4f35')];
const PAINT = [C('paint', 'Под покраску', '#f2f2f2')];
const ALU = [
  C('alu_silver', 'Серебро', '#c0c3c6'), C('alu_black', 'Черный', '#222'), C('alu_black_moire', 'Черный муар', '#2c2c2c'), C('alu_white', 'Вайт', '#f4f4f1'),
  C('alu_night', 'Серая ночь', '#55585c'), C('alu_champagne', 'Шампань', '#d8c7a3'), C('alu_nickel', 'Никель', '#a9a9a2'), C('alu_deore', 'Деоре', '#b49b6b'),
  C('alu_gold', 'Золото', '#c9a64b'), C('alu_bronze', 'Бронза', '#7d5f3f'), C('alu_copper', 'Медь', '#a7623b'),
];

/** Серия прайса → раздел сайта и цвета */
interface SeriesView { site?: string; suffix: string; colors: ColorDef[]; photoNote?: string }
const VIEW: Record<string, SeriesView> = {
  PD: { site: 'pd', suffix: 'PD', colors: [...BASE, ...PEARL] },
  PM: { suffix: 'PM', colors: [...BASE, ...PEARL] },
  PDO_IE: { site: 'pd_o', suffix: 'PD.O', colors: [...BASE, ...PEARL] },
  PDO_UN: { site: 'pd_o', suffix: 'PD.O', colors: UNILACK },
  PO_IE: { site: 'p_o', suffix: 'P.O', colors: [...BASE, ...PEARL, ...ELEGANT] },
  PO_UN: { site: 'p_o', suffix: 'P.O', colors: UNILACK },
  NDO: { suffix: 'ND.O', colors: WOOD_T },
  NO_T: { site: 'n_o', suffix: 'N.O', colors: WOOD_T },
  NO_NT: { site: 'n_o', suffix: 'N.O', colors: WOOD_NT },
  PAINT: { suffix: 'PE.O', colors: PAINT },
  PE: { site: 'pe', suffix: 'PE', colors: [...BASE, ...PEARL, ...ELEGANT] },
  PEO_IE: { site: 'pe_o', suffix: 'PE.O', colors: [...BASE, ...PEARL, ...ELEGANT] },
  PEO_UN: { site: 'pe_o', suffix: 'PE.O', colors: UNILACK },
  NEO_T: { site: 'ne_o', suffix: 'NE.O', colors: WOOD_T },
  NEO_NT: { site: 'ne_o', suffix: 'NE.O', colors: WOOD_NT },
  APO: { suffix: 'AP.O', colors: ALU },
  AVO: { suffix: 'AV.O', colors: ALU },
  AXO: { suffix: 'AX.O', colors: ALU },
};
export const seriesView = (id: string | undefined): SeriesView => VIEW[id ?? ''] ?? { suffix: '', colors: [] };
export const colorById = (seriesId: string | undefined, colorId: string | undefined) => seriesView(seriesId).colors.find(c => c.id === colorId);

/** Ссылка на кружок-образец цвета с сайта (если есть) */
export function swatchUrl(cat: PhotoCatalog | null, colorId: string): string | null {
  if (!cat) return null;
  for (const s of Object.values(cat.series)) {
    const c = s.colors.find(x => x.x === colorId);
    if (c?.sw) return SITE + c.sw;
  }
  return null;
}

// ── Модели ─────────────────────────────────────────────────────────────────
type Tuple = number[];
const tuple = (s: string): Tuple | null => { const m = s.trim().match(/^(\d+(?:\.\d+)*)/); return m ? m[1].split('.').map(Number) : null; };

/** Разбор подписи строки прайса: «1.1.2 PD – 1.3.2 PD», «1.1.2 PD (р.8/р.15), 1.2.2 PD (р.6/р.12)» */
function labelParts(label: string) {
  return label.split(/,\s*/).map(part => {
    const m = part.match(/^(.*?)(?:\s*\(([^)]*)\))?$/)!;
    const r = m[2] ? [...m[2].matchAll(/р\.?\s*(\d+)/g)].map(x => Number(x[1])) : [];
    const [a, b] = m[1].split(/\s+[–-]\s+/);
    return { from: tuple(a), to: tuple(b ?? a), r };
  }).filter(p => p.from && p.to) as { from: Tuple; to: Tuple; r: number[] }[];
}
function covers(label: string, code: Tuple, r?: number) {
  return labelParts(label).some(p => {
    if (r ? !p.r.includes(r) : p.r.length) return false;
    if (p.from.length !== code.length || p.to.length !== code.length) return false;
    return code.every((v, i) => v >= Math.min(p.from[i], p.to[i]) && v <= Math.max(p.from[i], p.to[i]));
  });
}

export interface ModelEntry {
  key: string;            // slug сайта или подпись строки прайса
  name: string;           // «1.1.2 PD р.8»
  rows: number[];         // индексы строк прайса (заполнение)
  minPrice: number;
  photos?: Record<string, string>; // цвет → путь
}

function slugToName(slug: string, suffix: string) {
  const m = decodeURIComponent(slug).match(/^(\d+(?:_\d+)*)(?:_r_(\d+))?_?[a-z_]*$/);
  if (!m) return null;
  let code = m[1].split('_').map(Number);
  if (suffix === 'NE.O' && code.length === 1 && code[0] === 5) code = [52]; // на сайте 52 NE.O лежит по адресу 5ne_o
  return { code, r: m[2] ? Number(m[2]) : undefined, name: `${code.join('.')} ${suffix}${m[2] ? ` р.${m[2]}` : ''}` };
}

export function modelEntries(s: Series, cat: PhotoCatalog | null): ModelEntry[] {
  const v = seriesView(s.id);
  const site = v.site && cat?.series[v.site];
  const byRows = (rows: number[]) => Math.min(...rows.map(i => s.models[i].price));
  if (site) {
    const out: ModelEntry[] = [];
    for (const [slug, photos] of Object.entries(site.models)) {
      if (slug.includes('%')) continue; // дубль с кириллицей в адресе
      const p = slugToName(slug, v.suffix);
      if (!p) continue;
      const rows = s.models.map((m, i) => covers(m.model, p.code, p.r) ? i : -1).filter(i => i >= 0);
      if (!rows.length) continue;
      out.push({ key: slug, name: p.name, rows, minPrice: byRows(rows), photos });
    }
    const cmp = (a: string, b: string) => a.localeCompare(b, 'ru', { numeric: true });
    out.sort((a, b) => cmp(a.name, b.name));
    // Строки прайса без фото на сайте — тоже показываем
    const used = new Set(out.flatMap(e => e.rows));
    return [...out, ...rowEntries(s).filter(e => e.rows.every(i => !used.has(i)))];
  }
  return rowEntries(s);
}

function rowEntries(s: Series): ModelEntry[] {
  const map = new Map<string, number[]>();
  s.models.forEach((m: ModelPrice, i) => map.set(m.model, [...(map.get(m.model) ?? []), i]));
  return [...map].map(([label, rows]) => ({ key: label, name: label, rows, minPrice: Math.min(...rows.map(i => s.models[i].price)) }));
}

/** Фото модели в выбранном цвете (или в любом другом, если такого нет) */
export function entryPhoto(e: ModelEntry | undefined, colorId: string | undefined) {
  if (!e?.photos) return null;
  const exact = colorId ? e.photos[colorId] : undefined;
  const path = exact ?? e.photos.white ?? e.photos.alaska ?? Object.values(e.photos)[0];
  const urls = photoUrls(path);
  return urls ? { ...urls, exact: !!exact } : null;
}

/** Фото двери проёма (для КП) */
export function doorPhoto(cat: PhotoCatalog | null, s: Series | undefined, d: { modelKey?: string; modelIdx: number; colorId?: string; photo?: string } | undefined): string | undefined {
  if (!d || !s) return undefined;
  const list = modelEntries(s, cat);
  const e = list.find(x => x.key === d.modelKey) ?? list.find(x => x.rows.includes(d.modelIdx));
  return entryPhoto(e, d.colorId)?.thumb ?? d.photo;
}
