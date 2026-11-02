/**
 * Ограничения по размерам полотен — вручную по прайсу PROFILDOORS (Казахстан, с 05.10.2026).
 * Учтено: серия, модель, вид стекла/покрытия, категория стекла, вариант открывания, зеркало с одной стороны,
 * вид стационарного полотна (AG: E/F/G). При обновлении прайса сверить с текстом «изготавливаются по высоте/ширине».
 */
import type { Opening, Series } from '@/lib/price';

export type OpenKind = 'swing' | 'slide' | 'pivot' | 'penal' | 'magic' | 'book';
export const OPEN_KINDS: { key: OpenKind; label: string }[] = [
  { key: 'swing', label: 'Распашное' },
  { key: 'slide', label: 'Раздвижное (Купе, Каскад, Купе Invisible)' },
  { key: 'pivot', label: 'Поворотное Pivot' },
  { key: 'penal', label: 'Пенал (K-Push, Каскад)' },
  { key: 'magic', label: 'Magic Uniq' },
  { key: 'book', label: 'Складное «Книжка»' },
];

type R = [number, number];
type Widths = Partial<Record<OpenKind, R>>;
interface GlassRule { match: string[]; h?: R; w?: Widths; note: string }
interface SeriesRules {
  h: R;                       // высота по умолчанию
  w: Widths;                  // ширина по видам открывания (нет ключа — такое открывание серия не делает)
  step: string;
  models?: Record<string, { h?: R; w?: Widths; only?: OpenKind[]; note?: string }>;
  glass?: GlassRule[];        // по виду стекла/покрытия; match: тип списка, название, или «cat:2»
  glassModelOverride?: string[]; // модели, где высота не зависит от стекла
  mirrorW?: R;                // распашное полотно с зеркалом с одной стороны
  groups?: Record<string, { w: GlassRule[]; step: string }>; // AG: E/F/G-полотна
}

const STEP50 = 'Шаг 50 мм; выше 2700 мм — шаг 5 мм';
const W_STD: Widths = { swing: [400, 1000], slide: [600, 1200], pivot: [600, 1200], penal: [600, 1000], magic: [700, 1000], book: [700, 1000] };
const W_600: Widths = { swing: [600, 1000], slide: [600, 1200], pivot: [600, 1000], penal: [600, 1000], magic: [700, 1000], book: [700, 1000] };
const AG_GLASS: GlassRule[] = [
  { match: ['Светопропускаемые стекла с зеркальным эффектом', 'Страйп', 'Зеркало синее'], h: [1000, 2750], note: 'Стекла с зеркальным эффектом, Страйп, Зеркало синее — до 2750 мм' },
  { match: ['Светопропускаемые стекла'], h: [1000, 3200], note: 'Светопропускаемые стекла — до 3200 мм' },
  { match: ['Матовые эмалированные стекла', 'Глянцевые эмалированные стекла', 'Зеркала', 'Светопропускаемые цветные стекла', 'Декоративные светопропускаемые стекла', 'Декоративные светопропускаемые цветные стекла', 'Рифленые светопропускаемые стекла', 'Рифленные эмалированные стекла', 'Рифленые эмалированные стекла'], h: [1000, 3000], note: 'Эмалированные, зеркала, цветные, декоративные и рифлёные стекла — до 3000 мм' },
];
const AG_STATIONARY: GlassRule[] = [
  { match: ['Глянцевые эмалированные стекла', 'Матовые эмалированные стекла', 'Рифленные эмалированные стекла', 'Рифленые эмалированные стекла'], w: { swing: [300, 1000] }, note: 'Эмалированные и рифлёные эмалированные — ширина 300–1000 мм' },
  { match: ['Декоративные светопропускаемые стекла', 'Декоративные светопропускаемые цветные стекла'], w: { swing: [300, 1400] }, note: 'Декоративные — ширина 300–1400 мм' },
  { match: ['Светопропускаемые стекла с зеркальным эффектом', 'Светопропускаемые цветные стекла'], w: { swing: [300, 1600] }, note: 'С зеркальным эффектом и цветные — ширина 300–1600 мм' },
  { match: ['Светопропускаемые стекла', 'Зеркала', 'Рифленые светопропускаемые стекла'], w: { swing: [300, 2000] }, note: 'Светопропускаемые, зеркала, рифлёные светопропускаемые — ширина 300–2000 мм' },
];

export const SIZE_RULES: Record<string, SeriesRules> = {
  'Под покраску': {
    h: [1800, 3000], w: { ...W_STD }, step: `${STEP50}. Magic Uniq и «Книжка» — шаг по ширине 100 мм`,
    models: {
      '0 PE.O': { h: [1800, 3000] },
      '0 SE.O': { h: [1800, 3000] },
      '0 AGN': { h: [1800, 4000] },
      '0 ST': { h: [1800, 4000], w: { swing: [600, 1000], pivot: [600, 1200], magic: [700, 1000] }, only: ['swing', 'pivot', 'magic'], note: '0 ST — распашное универсальное, Pivot или Magic Uniq; раздвижные, пенал и «Книжка» не делаются' },
    },
    mirrorW: [700, 1000],
  },
  AG: {
    h: [1000, 3200], w: { ...W_STD, slide: [600, 1200] }, step: `${STEP50}. Стационарные E/F/G-полотна — шаг 1 мм`,
    models: {
      '12': { h: [1000, 2750], note: 'Модель 12 — до 2750 мм при любом стекле' },
      '2': { h: [1000, 3800], note: 'Модели 2, 13, 14 — до 3800 мм при любом стекле' },
      '13': { h: [1000, 3800], note: 'Модели 2, 13, 14 — до 3800 мм при любом стекле' },
      '14': { h: [1000, 3800], note: 'Модели 2, 13, 14 — до 3800 мм при любом стекле' },
    },
    glass: AG_GLASS, glassModelOverride: ['12', '2', '13', '14'],
    groups: {
      'Ответное стационарное полотно': { w: AG_STATIONARY, step: 'Шаг 1 мм; уже 500 мм — уценка 20%' },
      'Боковое стационарное полотно': { w: AG_STATIONARY, step: 'Шаг 1 мм; уже 500 мм — уценка 20%' },
      'Отдельно стоящее стационарное полотно': { w: AG_STATIONARY, step: 'Шаг 1 мм; только модели 1, 2, 13, 14' },
    },
  },
  AGX: { h: [1000, 3200], w: { ...W_STD }, step: STEP50, glass: AG_GLASS },
  AT: {
    h: [1000, 3200], w: { swing: [400, 1000], slide: [600, 1200], pivot: [600, 1200], penal: [600, 1000] }, step: `${STEP50}. Пенал — только K-Push`,
    glass: AG_GLASS,
  },
  'P, N': { h: [1900, 2300], w: { swing: [600, 900], slide: [600, 900] }, step: 'Шаг полотна 100 мм' },
  PD: { h: [1900, 2300], w: { swing: [600, 900], slide: [600, 900] }, step: 'Шаг полотна 100 мм' },
  'PE.O, NE.O': { h: [1800, 3000], w: { ...W_STD }, step: `${STEP50}. Magic Uniq и «Книжка» — шаг по ширине 100 мм` },
  GE: { h: [1800, 2700], w: { ...W_STD }, step: 'Шаг 50 мм', mirrorW: [700, 1000] },
  'SE.O': { h: [1800, 3000], w: { ...W_STD }, step: STEP50, mirrorW: [700, 1000] },
  SE: { h: [1000, 2700], w: { swing: [600, 1000], slide: [600, 1200], pivot: [600, 1000], penal: [600, 1000], magic: [700, 1000] }, step: 'Шаг 50 мм; «Книжка» не делается' },
  ST: {
    h: [1000, 2700], w: { swing: [600, 1000], pivot: [600, 1000], magic: [700, 1000] }, step: `${STEP50}. Раздвижные, пенал и «Книжка» не делаются`,
    models: { '1': { h: [1000, 3000], note: 'Модель 1 — до 3000 мм, остальные — до 2700 мм' } },
  },
  VE: {
    h: [1000, 3000], w: { ...W_600 }, step: STEP50,
    glass: [{ match: ['Эбен'], h: [1000, 2600], note: 'Шпон «Эбен» — до 2600 мм' }],
  },
  VT: {
    h: [1000, 3000], w: { swing: [600, 1000], pivot: [600, 1000], magic: [700, 1000] }, step: `${STEP50}. Раздвижные, пенал и «Книжка» не делаются`,
    glass: [{ match: ['Эбен'], h: [1000, 2600], note: 'Шпон «Эбен» — до 2600 мм' }],
  },
  AGN: {
    h: [1000, 3000], w: { swing: [400, 1000], slide: [600, 1200], pivot: [400, 1250], penal: [600, 1000], magic: [700, 1000], book: [700, 1000] }, step: STEP50,
    glass: [
      { match: ['Зеркало синее', 'Страйп'], h: [1000, 2750], note: 'Зеркало синее и Страйп — до 2750 мм' },
      { match: ['cat:2'], w: { swing: [400, 900] }, note: 'Стекла Категории 2 — распашное полотно до 900 мм по ширине' },
    ],
  },
  'Серия FT EI30': { h: [1800, 2600], w: { swing: [700, 1200] }, step: 'Шаг по высоте 10 мм, по ширине 50 мм; только распашное' },
};

const norm = (x: string) => x.toLowerCase().replace(/["«»]/g, '').replace(/рифленн/g, 'рифлен').trim();
const modelKey = (code: string) => code.trim().split(/[\s/(]/)[0];

export interface Limits { h: R | null; w: R | null; notes: string[]; step: string; unavailable?: string }

/** Ограничения для текущего проёма; finishType — тип списка, где найдено выбранное стекло/покрытие */
export function sizeLimits(s: Series, o: Opening, finishType: string, finishCat: number | null, hasMirror: boolean): Limits {
  const r = SIZE_RULES[s.sheet];
  if (!r) return { h: s.info?.h ?? null, w: s.info?.w ?? null, notes: [], step: '' };
  const kind = (o.openKind ?? 'swing') as OpenKind;
  const notes: string[] = [];
  let h: R | null = r.h;
  let w: R | null = r.w[kind] ?? null;
  let unavailable: string | undefined;
  if (!r.w[kind]) unavailable = `Серия ${s.sheet}: открывание «${OPEN_KINDS.find(k => k.key === kind)?.label}» не производится`;

  const full = o.model.trim();
  const mr = r.models?.[full] ?? r.models?.[modelKey(full)];
  if (mr) {
    if (mr.h) h = mr.h;
    if (mr.w) { w = mr.w[kind] ?? null; if (!mr.w[kind]) unavailable = mr.note ?? `Модель ${full}: такое открывание не производится`; else unavailable = undefined; }
    if (mr.only && !mr.only.includes(kind)) unavailable = mr.note ?? `Модель ${full}: такое открывание не производится`;
    if (mr.note) notes.push(mr.note);
  }

  const fin = o.finish ? norm(o.finish) : '';
  const ft = finishType ? norm(finishType.replace(/\s*\(.*\)$/, '')) : '';
  const hits = (g: GlassRule) => g.match.some(m => m.startsWith('cat:') ? finishCat === Number(m.slice(4)) : (norm(m) === fin || (!!ft && norm(m) === ft)));
  const modelFixed = r.glassModelOverride?.includes(modelKey(full));
  if (r.glass) {
    if (!o.finish) {
      if (!modelFixed) notes.push(...r.glass.map(g => g.note));
    } else {
      const g = r.glass.find(hits);
      if (g) {
        if (g.h && !modelFixed) h = g.h;
        if (g.w?.[kind]) w = g.w[kind]!;
        notes.push(g.note);
      }
    }
  }
  if (hasMirror && kind === 'swing' && r.mirrorW) { w = r.mirrorW; notes.push(`С зеркалом с одной стороны — ширина ${r.mirrorW[0]}–${r.mirrorW[1]} мм`); }

  let step = r.step;
  const grp = o.group && r.groups?.[o.group];
  if (grp) {
    step = grp.step;
    const g = o.finish ? grp.w.find(hits) : undefined;
    w = g?.w?.swing ?? [300, 2000];
    unavailable = undefined;
    notes.push(...(g ? [g.note] : grp.w.map(x => x.note)));
  }
  return { h, w, notes: [...new Set(notes)], step, unavailable };
}

export function limitWarnings(l: Limits, o: Opening): string[] {
  const out: string[] = [];
  if (l.unavailable) out.push(l.unavailable);
  if (l.h && o.height && (o.height < l.h[0] || o.height > l.h[1])) out.push(`Высота ${o.height} мм — можно ${l.h[0]}–${l.h[1]} мм`);
  if (l.w && o.width && (o.width < l.w[0] || o.width > l.w[1])) out.push(`Ширина ${o.width} мм — можно ${l.w[0]}–${l.w[1]} мм`);
  return out;
}
