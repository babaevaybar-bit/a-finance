/**
 * Комплектация проёма: короб, наличники, доборы — подбираются из прайса автоматически
 * по серии, цвету (перламутр), высоте, ширине проёма и толщине стены.
 */
import { CATALOG, type CatalogItem } from './accessories';

export type FrameType = 'tele' | 'copl' | 'invisible' | 'mono' | 'none';

export interface FrameSpec {
  type: FrameType;
  wall?: number;              // толщина стены, мм
  nal?: string;               // стиль наличника (ключ из nalStyles)
  sides?: 0 | 1 | 2;          // наличники с двух / одной стороны / без
  invisible?: string;         // вид скрытого короба
  monoNal?: string;           // наличники моноблока: 40 / 60 / 80 / reverse
  over?: Record<string, number>; // ручная правка количества по ролям (0 — убрать строку)
}

export interface FrameLine {
  role: string;               // box, nal-face, nal-back, dob-0 …
  label: string;              // что это: «Короб», «Наличник лицевой» …
  item?: CatalogItem;
  qty: number;                // количество на один проём (с учётом правки)
  autoQty: number;
  hint?: string;
  warn?: string;
}

export interface FrameCtx {
  seriesId: string;
  perl: boolean;
  doorH: number;              // высота полотна (максимальная)
  leavesW: number;            // ширина всех полотен вместе
  double: boolean;            // распашной (2 и более полотна)
  reverse: boolean;
  openType?: string;
  leafPrices?: number[];      // цена каждого полотна (для COMPACK: +70% второго полотна)
  leafWidths?: number[];
}

// ── Семейства серий в прайсе комплектующих ──────────────────────────────────
type Family = 'PD_PM' | 'IE' | 'UN' | 'EO' | 'EO_UN' | 'ALU';
const FAMILY: Record<string, Family> = {
  PD: 'PD_PM', PM: 'PD_PM',
  PDO_IE: 'IE', PO_IE: 'IE', NDO: 'IE', NO_T: 'IE',
  PDO_UN: 'UN', PO_UN: 'UN', NO_NT: 'UN',
  // PE (без .O) по прайсу комплектуется погонажем PD/PM: короб 46×85, наличники 16×90, доборы 16 мм
  PE: 'PD_PM', PEO_IE: 'EO', PEO_UN: 'EO_UN', NEO_T: 'EO', NEO_NT: 'EO_UN', PAINT: 'EO',
  APO: 'ALU', AVO: 'ALU', AXO: 'ALU',
};
const TAG: Record<Family, string> = {
  PD_PM: 'PD, PM, PE', IE: 'Ин.Эм. PD.O, P.O, Текстура ND.O, N.O', UN: 'Unilack PD.O, P.O, без Текстур N.O', EO: ' PE.O, NE.O', EO_UN: 'Unilack PE.O, без Текстур NE.O', ALU: '§',
};
export const familyOf = (seriesId: string) => FAMILY[seriesId] ?? 'IE';
const isEO = (f: Family) => f === 'EO' || f === 'EO_UN';
export const boxDepth = (seriesId: string) => BOX_DEPTH[familyOf(seriesId)];
// Телескопический короб 46×85 по прайсу закрывает стену от 79 до 102 мм; у остальных — по глубине короба
const BOX_DEPTH: Record<Family, number> = { PD_PM: 102, IE: 80, UN: 80, EO: 76, EO_UN: 76, ALU: 0 };
const BOX_TH: Record<Family, number> = { PD_PM: 46, IE: 36, UN: 36, EO: 36, EO_UN: 36, ALU: 0 };

const isPerl = (c: CatalogItem) => /Перламутр/.test(c.spec ?? '');
/** Выбрать вариант позиции: перламутр, если есть такой, иначе обычный */
function pickPerl(list: CatalogItem[], perl: boolean) {
  return (perl ? list.find(isPerl) : undefined) ?? list.find(c => !isPerl(c)) ?? list[0];
}
const famItems = (f: Family, section: CatalogItem['section']) => CATALOG.filter(c => c.section === section && c.name.includes(TAG[f]));

// ── Варианты для интерфейса ────────────────────────────────────────────────
export function frameTypes(seriesId: string): { id: FrameType; label: string; hint: string }[] {
  const f = familyOf(seriesId);
  const out: { id: FrameType; label: string; hint: string }[] = [];
  if (isEO(f)) out.push({ id: 'copl', label: 'Компланарный', hint: 'короб 36×76, дверь в одной плоскости со стеной' });
  else if (f !== 'ALU') out.push({ id: 'tele', label: 'Телескопический', hint: f === 'PD_PM' ? 'короб 46×85, стена 79–102 мм' : 'короб 36×80' });
  // По сайту фабрики: скрытый короб Invisible — только у каркасных PE.O / NE.O; Моноблок EXPORT — у всех
  if (isEO(f)) out.push({ id: 'invisible', label: 'Скрытый Invisible', hint: 'без наличников, под покраску стены' });
  if (f !== 'ALU') out.push({ id: 'mono', label: 'Моноблок EXPORT', hint: 'короб с наличниками в сборе' });
  out.push({ id: 'none', label: 'Без короба', hint: 'добавить позиции вручную' });
  return out;
}

export interface NalStyle { id: string; label: string; width: number; face: string; back?: string }
export function nalStyles(seriesId: string): NalStyle[] {
  const f = familyOf(seriesId);
  if (f === 'PD_PM') return [
    { id: 'pd90', label: 'Прямой / Тип 1 / Тип 4 · 90 мм', width: 90, face: 'Наличник Прямой / Тип 1 / Тип 4' },
    { id: 'pd80', label: 'Тип 5 · 80 мм', width: 80, face: 'Наличник Тип 5' },
    { id: 'pd120', label: 'Прямой широкий · 120 мм', width: 120, face: 'Наличник Прямой PD' },
  ];
  if (isEO(f)) return [
    { id: 'eoS', label: 'Прямой · 80 мм', width: 80, face: 'компланарный (лицевой) Прямой', back: 'телескопический (тыльный) Прямой' },
    { id: 'eoK', label: 'Каннелюр · 80 мм', width: 80, face: 'компланарный (лицевой) Каннелюр', back: 'телескопический (тыльный) Каннелюр' },
  ];
  if (f === 'ALU') return [];
  return [
    { id: 'oS', label: 'Прямой · 80 мм', width: 80, face: 'Наличник Прямой' },
    { id: 'oF', label: 'Фигурный · 80 мм', width: 80, face: 'Наличник Фигурный' },
    { id: 'oK', label: 'Каннелюр · 80 мм', width: 80, face: 'Наличник Каннелюр' },
  ];
}

export const INVISIBLE_KINDS = ['Invisible', 'Invisible Infinity', 'Invisible Reverse'];
export const MONO_NAL = [{ id: '40', label: 'Наличник 40 мм' }, { id: '60', label: 'Наличник 60 мм' }, { id: '80', label: 'Наличник 80 мм' }];

export function defaultFrame(seriesId: string): FrameSpec {
  const t = frameTypes(seriesId)[0];
  return { type: t.id, wall: 100, nal: nalStyles(seriesId)[0]?.id, sides: 2, invisible: 'Invisible', monoNal: '60' };
}

/** Поправить комплектацию под новую серию (тип короба и стиль наличника могут не подходить) */
export function fitFrame(fr: FrameSpec, seriesId: string): FrameSpec {
  const types = frameTypes(seriesId);
  const type = types.some(t => t.id === fr.type) ? fr.type
    : (fr.type === 'tele' || fr.type === 'copl') ? types[0].id : 'none';
  const styles = nalStyles(seriesId);
  const nal = styles.some(s => s.id === fr.nal) ? fr.nal : styles[0]?.id;
  return { ...fr, type, nal };
}

// ── Расчёт ─────────────────────────────────────────────────────────────────
/** Наличник 2440: на сторону две стойки + верх (половина планки, если хватает) */
function piecesPerSide(topLen: number, barLen: number) {
  const top = topLen <= barLen / 2 ? 0.5 : topLen <= barLen ? 1 : Math.ceil(topLen / barLen);
  return 2 + top;
}
const barLength = (c: CatalogItem | undefined) => Number((c?.spec ?? '').match(/×(\d{4})/)?.[1] ?? 2440);

export function frameLines(fr: FrameSpec | undefined, x: FrameCtx): FrameLine[] {
  if (!fr || fr.type === 'none') return [];
  const f = familyOf(x.seriesId);
  const lines: FrameLine[] = [];
  const put = (l: Omit<FrameLine, 'qty'>) => lines.push({ ...l, qty: fr.over?.[l.role] ?? l.autoQty });
  const tall = x.doorH > 2350;
  const pairWord = x.double ? 'распашной' : 'одностворчатый';

  if (fr.type === 'tele' || fr.type === 'copl') {
    // Короб
    const boxes = famItems(f, 'Короб').filter(c => c.spec?.includes(pairWord) && (c.name.includes('компланарный') === (fr.type === 'copl')));
    const len = tall && boxes.some(c => c.spec?.includes('2750')) ? '2750' : '2440';
    const box = pickPerl(boxes.filter(c => c.spec?.includes(len)), x.perl);
    put({ role: 'box', label: (x.double ? 'Короб распашной' : 'Короб') + (fr.type === 'copl' && x.reverse ? ' Reverse' : ''), item: box, autoQty: 1,
      hint: fr.type === 'copl' && x.reverse ? 'для Reverse — компланарный короб Reverse, цена по прайсу как у обычного, уточните' : undefined,
      warn: tall && len === '2440' ? 'полотно выше 2350 мм — короб 2440 может не подойти, уточните' : undefined });

    // Наличники
    const st = nalStyles(x.seriesId).find(s => s.id === fr.nal) ?? nalStyles(x.seriesId)[0];
    const sides = fr.sides ?? 2;
    if (st && sides > 0) {
      const nalList = (part: string) => famItems(f, 'Наличник').filter(c => c.name.includes(part));
      const byLen = (list: CatalogItem[]) => {
        const want = tall ? '2750' : '2440';
        const l2 = list.filter(c => c.spec?.includes(want));
        return pickPerl(l2.length ? l2 : list, x.perl);
      };
      const topLen = x.leavesW + 2 * BOX_TH[f] + 2 * st.width;
      const face = byLen(nalList(st.face));
      const per = piecesPerSide(topLen, barLength(face));
      if (st.back) {
        put({ role: 'nal-face', label: `Наличник ${st.label.split(' · ')[0]}, лицевой`, item: face, autoQty: per, hint: `${per} шт на сторону` });
        if (sides === 2) put({ role: 'nal-back', label: `Наличник ${st.label.split(' · ')[0]}, тыльный`, item: byLen(nalList(st.back)), autoQty: per, hint: `${per} шт на сторону` });
      } else {
        put({ role: 'nal-face', label: `Наличник ${st.label.split(' · ')[0]}`, item: face, autoQty: per * sides, hint: `${per} шт на сторону × ${sides}` });
      }
    }

    // Доборы
    const need = (fr.wall ?? 0) - BOX_DEPTH[f];
    if (need > 5) {
      const dobs = famItems(f, 'Добор').filter(c => !c.unit.startsWith('м'));
      const widths = [...new Set(dobs.map(c => Number(c.spec?.match(/×(\d+)×/)?.[1] ?? 0)))].filter(Boolean).sort((a, b) => a - b);
      const parts: number[] = [];
      let rest = need;
      while (rest > 5 && widths.length && parts.length < 3) {
        const w = widths.find(v => v >= rest) ?? widths[widths.length - 1];
        parts.push(w); rest -= w;
      }
      parts.forEach((w, i) => {
        const cand = dobs.filter(c => c.spec?.includes(`×${w}×`));
        const want = tall ? '2750' : '2440';
        const l2 = cand.filter(c => c.spec?.includes(want));
        const item = pickPerl(l2.length ? l2 : cand, x.perl);
        const per = piecesPerSide(x.leavesW + 2 * BOX_TH[f], barLength(item));
        put({ role: `dob-${i}`, label: parts.length > 1 ? `Добор ${i + 1}` : 'Добор', item, autoQty: per,
          hint: i === 0 ? `стена ${fr.wall} мм − короб ${BOX_DEPTH[f]} мм = ${need} мм` : undefined });
      });
    }
  }

  if (fr.type === 'invisible') {
    const kind = fr.invisible ?? 'Invisible';
    const list = CATALOG.filter(c => c.section === 'Скрытый короб');
    let item: CatalogItem | undefined;
    if (x.doorH <= 2300) item = list.find(c => c.name === `Короб ${kind}` && c.spec?.includes('2000–2300'));
    else item = kind === 'Invisible Reverse' ? list.find(c => c.name === 'Короб Invisible Reverse' && c.spec?.includes('2301')) : list.find(c => c.name === 'Короб Invisible ALU');
    put({ role: 'box', label: 'Скрытый короб', item, autoQty: x.double ? 2 : 1,
      warn: !item ? 'для такой высоты этого вида нет в прайсе' : x.double ? 'для двустворчатого посчитано 2 короба — уточните у поставщика' : undefined });
  }

  if (fr.type === 'mono') {
    const reverse = x.reverse;
    const title = reverse ? 'Моноблок Reverse, наличники 80 мм лицевые / 60 мм тыльные' : `Моноблок, наличники ${fr.monoNal ?? '60'} мм с двух сторон`;
    const ext = reverse ? 'Расширитель для Моноблока Reverse (добор)' : 'Расширитель для Моноблока (добор)';
    const hb = x.doorH <= 2100 ? '2000–2100' : x.doorH <= 2400 ? '2101–2400' : '2401–2600';
    const pair = x.double && !reverse ? 'распашной' : 'одностворчатый';
    const rows = [95, 135, 185, 250];
    const wall = fr.wall ?? 95;
    const base = [...rows].reverse().find(r => r <= wall) ?? 95;
    const pick = (t: string, wallTxt: string) => pickPerl(CATALOG.filter(c => c.section === 'Моноблок' && c.name === t && c.spec?.startsWith(`стена ${wallTxt}, полотно ${hb}, ${pair}`)), x.perl);
    const item = pick(title, `${base} мм`);
    put({ role: 'box', label: reverse ? 'Моноблок EXPORT Reverse' : 'Моноблок EXPORT', item, autoQty: 1, hint: `под стену ${base} мм`,
      warn: !item ? 'нет в прайсе для такой высоты' : x.doorH > 2600 ? 'полотно выше 2600 мм — моноблока нет в прайсе' : undefined });
    const rest = wall - base;
    if (rest > 10) {
      const e = [65, 100, 150].find(v => v >= rest) ?? 150;
      put({ role: 'dob-0', label: 'Расширитель', item: pick(ext, `${e} мм`), autoQty: 1, hint: `стена ${wall} мм − моноблок ${base} мм = ${rest} мм` });
    }
  }
  return lines;
}

export const frameLineSum = (l: FrameLine) => (l.item?.price ?? 0) * l.qty;

// ── Системы открывания (прайс май 2026) ────────────────────────────────────
const sys = (name: string, spec: string, price: number): CatalogItem => ({ id: `sys:${name}:${spec}`, section: 'Прочее', name, spec, unit: 'компл', price, kp: 'door' });

/** Комплект системы открывания для выбранного вида открывания */
export function systemLines(fr: FrameSpec | undefined, x: FrameCtx): FrameLine[] {
  const t = (x.openType ?? '').toLowerCase();
  const n = x.leafPrices?.length ?? 1;
  const out: FrameLine[] = [];
  const put = (l: Omit<FrameLine, 'qty'>) => out.push({ ...l, qty: fr?.over?.[l.role] ?? l.autoQty });
  const maxW = Math.max(0, ...(x.leafWidths ?? [0]));
  if (t === 'купе') {
    put(n > 1
      ? { role: 'sys', label: 'Раздвижная система', item: sys('Комплект раздвижной Тип 2/5', 'трек 4000 мм на стену, два активных полотна', 341641), autoQty: 1 }
      : { role: 'sys', label: 'Раздвижная система', item: sys('Комплект раздвижной Тип 2', 'трек 2000 мм на стену, одно активное полотно', 227763), autoQty: 1 });
  } else if (t === 'купе invisible') {
    put(n > 1
      ? { role: 'sys', label: 'Раздвижная система', item: sys('Комплект раздвижной Тип 3/2', 'трек 2000 мм, два активных полотна', 417557), autoQty: 1, hint: 'уточните длину трека и крепление' }
      : { role: 'sys', label: 'Раздвижная система', item: sys('Комплект раздвижной Тип 3/1', 'трек 2000 мм, одно активное полотно', 227763), autoQty: 1, hint: 'уточните длину трека и крепление' });
  } else if (t.startsWith('пенал')) {
    const h = x.doorH;
    const [price, spec] = h <= 2300 ? [385521, 'полотно 2000–2300'] : h <= 2600 ? [477701, 'полотно 2400–2600'] : [569908, 'полотно 2700–3000'];
    const wide = maxW > 900;
    put({ role: 'sys', label: 'Система «Пенал K-PUSH»', item: sys('Система «Пенал K-PUSH»', spec + (wide ? ', ширина 1000 (+10%)' : ''), price * (wide ? 1.1 : 1)), autoQty: n > 1 ? n : 1 });
    const [fp, fs] = h <= 2300 ? [234669, 'полотно 2000–2300'] : [251423, 'полотно 2400–3000'];
    const k = (wide ? 1.1 : 1) * (n > 1 ? 1.4 : 1);
    put({ role: 'sys-frame', label: 'Обрамление пенала', item: sys('Обрамление для системы «Пенал K-PUSH»', fs + (n > 1 ? ', двустворчатое (+40%)' : '') + (wide ? ', ширина 1000 (+10%)' : ''), Math.round(fp * k)), autoQty: 1 });
  } else if (t === 'книжка') {
    put({ role: 'sys', label: 'Складная система', item: sys('Комплект складной «Книжка Тип 2»', 'короб и наличники — отдельно', 66440), autoQty: 1 });
  } else if (t === 'compack') {
    const second = x.leafPrices?.[1] ?? x.leafPrices?.[0] ?? 0;
    // по прайсу: система + первое полотно + 70% второго; оба полотна уже в цене проёма — вычитаем 30% второго
    put({ role: 'sys', label: 'Складная система', item: sys('Комплект складной «COMPACK»', `система 467 888 ₸, второе полотно по прайсу считается 70% (−${Math.round(second * 0.3).toLocaleString('ru-RU')} ₸)`, 467888 - Math.round(second * 0.3)), autoQty: 1 });
  } else if (t === 'magic') {
    put({ role: 'sys', label: 'Раздвижная система', item: sys('Система MAGIC', 'комплект', 465934), autoQty: 1 });
  } else if (t.startsWith('рото')) {
    put({ role: 'sys', label: 'Поворотная система', item: sys('Дверной блок «РОТО»', 'комплект', 509303), autoQty: 1 });
  } else if (t === 'pivot') {
    put({ role: 'sys', label: 'Поворотная система', item: sys('Дверной блок «PIVOT»', 'комплект', 598639), autoQty: 1 });
  }
  return out;
}
