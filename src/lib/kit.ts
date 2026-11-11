/**
 * Комплектация проёма по прайсу PROFILDOORS: какие петли и сколько, какие короба подходят,
 * что нужно к замку (ответная планка, накладки, пометка в заказе). Всё — по разделам
 * «Варианты открываний», «Замки», «Петли» каждого листа прайса.
 */
import type { Item, Opening, PriceIndex } from '@/lib/price';

export type BoxKey = 'alu' | 'aluo' | 'rev' | 'slim' | 'integral' | 'integralRev' | 'u60' | 'tele' | 'copl' | 'coplRev' | 'mono' | 'monoRev';
export const BOX_LABEL: Record<BoxKey, string> = {
  alu: 'Invisible ALU', aluo: 'Invisible ALU.O', rev: 'Invisible Reverse', slim: 'SLIM', integral: 'Integral', integralRev: 'Integral Reverse',
  u60: 'Invisible 60U', tele: 'Телескопический', copl: 'Компланарный', coplRev: 'Компланарный Reverse', mono: 'Моноблок', monoRev: 'Моноблок Reverse',
};
/** Алюминиевые короба (ответные планки Alutop / KM 7 / «ALU TOUCH») и деревянные (Minimal / KM 5 / «TOUCH») */
export const ALU_BOXES: BoxKey[] = ['alu', 'aluo', 'rev', 'slim', 'integral', 'integralRev', 'u60'];

/** Какой короб у позиции прайса */
export function boxKeyOf(it: Item): BoxKey | null {
  const n = it.name.toLowerCase(), sh = it.sheet;
  if (sh === 'Короба INVISIBLE') {
    if (/reverse/.test(n)) return 'rev';
    if (/alu\.o/.test(n)) return 'aluo';
    if (/alu/.test(n)) return 'alu';
  }
  if (sh === 'Короб INVISIBLE 60U' && /короб/.test(n)) return 'u60';
  if (sh === 'Короб SLIM' && /короб/.test(n)) return 'slim';
  if (sh === 'INTEGRAL' && /^короб/.test(n)) return 'integral';
  if (sh === 'INTEGRAL Reverse' && /^короб/.test(n)) return 'integralRev';
  if (/^моноблок/i.test(sh) && /стойки коробочного/.test(n)) return /reverse/i.test(sh) || /reverse/.test(n) ? 'monoRev' : 'mono';
  if (/^коробка телескоп/.test(n)) return 'tele';
  if (/^коробка компланарная/.test(n)) return /reverse/.test(n) ? 'coplRev' : 'copl';
  return null;
}

export type HingeFamily = 'pd7000' | 'pd3000' | 'e22' | 'e30' | 'krona2780' | 'krona1019' | 'aldeghi8020';
export function hingeFamilyOf(it: Item): HingeFamily | null {
  if (it.sheet !== 'Петли') return null;
  const n = it.name.toLowerCase();
  if (n.includes('pd7000')) return 'pd7000';
  if (n.includes('pd3000')) return 'pd3000';
  if (n.includes('eclipse 2.2')) return 'e22';
  if (n.includes('eclipse 3.0')) return 'e30';
  if (n.includes('2780')) return 'krona2780';
  if (n.includes('1019')) return 'krona1019';
  if (n.includes('8020')) return 'aldeghi8020';
  return null;
}

export interface HingeSys {
  key: string;
  label: string;
  families: HingeFamily[];        // какие петли подходят ([] — петли уже в цене / не нужны)
  included?: string;              // «петли уже в цене полотна»
  count: (h: number, w: number, extra: boolean) => number;
  boxes: BoxKey[];
  reverse?: boolean;              // открывание от себя — к полотну нужна опция REVERSE
  note?: string;
}

// Количество петель — дословно по правилам прайса
const cntPD7000 = (h: number) => (h <= 2250 ? 2 : h <= 2350 ? 3 : 4);
const cntEclipse = (h: number) => (h <= 2250 ? 2 : h <= 2300 ? 3 : h < 3000 ? 4 : 5);
const cntAGN = (h: number) => (h <= 2150 ? 3 : h <= 2450 ? 4 : h <= 3000 ? 5 : 6);
const cntAG = (h: number) => (h <= 2150 ? 2 : h <= 2300 ? 3 : h <= 2500 ? 4 : h <= 2800 ? 5 : h <= 3200 ? 6 : 7);
const plus1 = (w: number, extra: boolean) => (w >= 1000 || extra ? 1 : 0);
const PLUS1 = 'К полотну шириной 1000 мм, с шумоизоляцией или зеркалом — +1 петля';

const sysPD7000 = (boxes: BoxKey[]): HingeSys => ({ key: 'pd7000', label: 'На себя · петли PD 7000', families: ['pd7000'], count: (h, w, e) => cntPD7000(h) + plus1(w, e), boxes, note: PLUS1 });
const sysE22 = (boxes: BoxKey[]): HingeSys => ({ key: 'e22', label: 'На себя · петли Eclipse 2.2', families: ['e22'], count: (h, w, e) => cntEclipse(h) + plus1(w, e), boxes, note: PLUS1 });
const sysE30 = (boxes: BoxKey[], pd3000 = true): HingeSys => ({ key: 'e30', label: pd3000 ? 'От себя (Reverse) · PD 3000 / Eclipse 3.0' : 'От себя (Reverse) · Eclipse 3.0', families: pd3000 ? ['pd3000', 'e30'] : ['e30'], count: (h, w, e) => cntEclipse(h) + plus1(w, e), boxes, reverse: true, note: PLUS1 });
const sysBook = (boxes: BoxKey[]): HingeSys => ({ key: 'book', label: '«Книжка» · 3 петли Eclipse 2.2', families: ['e22'], count: () => 3, boxes, note: 'В «Книжке» всегда 3 петли Eclipse 2.2 на полотно' });
const sysKrona = (cnt: (h: number) => number, note: string): HingeSys => ({ key: 'krona', label: 'Универсальное · петли Krona Koblenz 2780', families: ['krona2780'], count: cnt, boxes: ['u60'], note });
const sysAgnE22: HingeSys = { key: 'e22', label: 'На себя · петли Eclipse 2.2', families: ['e22'], count: h => cntAGN(h), boxes: ['alu', 'slim', 'integral'], note: 'AGN: 3–6 петель по высоте; в названии короба — «AGN» и сторонность' };
const sysAgnE30: HingeSys = { key: 'e30', label: 'От себя (Reverse) · Eclipse 3.0', families: ['e30'], count: h => cntAGN(h), boxes: ['rev', 'integralRev'], reverse: true, note: 'AGN: 3–5 петель по высоте; в названии короба — «AGN» и сторонность' };

const WOOD_E22: BoxKey[] = ['tele', 'mono', 'alu', 'slim', 'integral'];

/** Варианты открывания/петель для серии и модели */
export function hingeSystems(sheet: string, model: string): HingeSys[] {
  const m = model.trim();
  switch (sheet) {
    case 'Под покраску':
      if (m === '0 ST') return [sysKrona(h => (h <= 2400 ? 2 : 3), '0 ST: 2 петли до 2400 мм, 3 — выше')];
      if (m === '0 AGN') return [sysAgnE22, sysAgnE30, sysBook(['tele', 'alu', 'slim', 'integral', 'mono'])];
      return [...(m === '0 PE.O' ? [sysPD7000(['aluo'])] : []), sysE22(['alu', 'slim', 'integral']), sysE30(['rev', 'integralRev']), sysBook(['tele', 'alu', 'slim', 'integral', 'mono'])];
    case 'PE.O, NE.O':
      return [sysPD7000(['copl', 'aluo']), sysE22(WOOD_E22), sysE30(['coplRev', 'monoRev', 'rev', 'integralRev']), sysBook(['tele', 'alu', 'slim', 'integral', 'mono'])];
    case 'GE':
      return [sysE22(['alu', 'slim', 'integral']), sysE30(['rev', 'integralRev']), sysBook(['alu', 'slim', 'integral'])];
    case 'SE.O': case 'SE': case 'VE':
      return [sysE22(WOOD_E22), sysE30(['monoRev', 'rev', 'integralRev']), ...(sheet === 'SE' ? [] : [sysBook(['tele', 'alu', 'slim', 'integral', 'mono'])])];
    case 'ST': case 'VT':
      return [sysKrona(h => (sheet === 'ST' ? 2 : h <= 2400 ? 2 : 3), sheet === 'ST' ? 'ST: петли Krona 2780 — 2 шт. до 3000 мм' : 'VT: 2 петли до 2400 мм, 3 — выше')];
    case 'AGN':
      return [sysAgnE22, sysAgnE30, sysBook(['alu', 'slim', 'integral'])];
    case 'AG': case 'AGX':
      return [{ key: 'ag', label: 'На себя · петли Aldeghi Luigi', families: [], included: 'Петли Aldeghi Luigi уже в цене полотна (в цвет профиля)', count: h => cntAG(h), boxes: ['alu', 'slim', 'integral'], note: 'AG: 2–7 петель по высоте, в цене полотна' }];
    case 'AT':
      return [{ key: 'at', label: 'На себя · осевые петли', families: [], included: '2 осевые петли уже в цене полотна', count: () => 2, boxes: ['alu', 'slim', 'integral'] }];
    case 'P, N': case 'PD':
      return [
        { key: 'pd7000', label: 'На себя · петли PD 7000', families: ['pd7000'], count: h => (h <= 2250 ? 2 : 3), boxes: ['tele'], note: 'До 2250 мм — 2 петли, 2300 мм — 3' },
        { key: 'krona1019', label: 'На себя · Krona 1019 / Aldeghi 8020', families: ['krona1019', 'aldeghi8020'], count: () => 3, boxes: ['tele'], note: 'Всегда 3 петли' },
      ];
    case 'Серия FT EI30':
      return [{ key: 'ft', label: 'Противопожарный блок', families: [], included: 'Петли Krona 2780, замок, ручки, доводчик и автопорог уже в цене блока', count: (h, w) => (h > 2300 || w > 900 ? 3 : 2), boxes: [] }];
    default:
      return [];
  }
}

export function currentSystem(sheet: string, model: string, key?: string): HingeSys | undefined {
  const list = hingeSystems(sheet, model);
  return list.find(s => s.key === key) ?? list[0];
}

/** Что указать в заказе и что докупить к замку — по выбранным опциям и коробу */
export function orderNotes(idx: PriceIndex, o: Opening): { text: string; addIds?: number[] }[] {
  const names = o.options.map(l => idx.byId.get(l.itemId)?.name ?? '').concat(o.extras.map(l => idx.byId.get(l.itemId)?.name ?? ''));
  const boxes = o.extras.map(l => idx.byId.get(l.itemId)).filter((x): x is Item => !!x).map(boxKeyOf).filter((x): x is BoxKey => !!x);
  const box = boxes[0];
  const alu = box ? ALU_BOXES.includes(box) : null;
  const out: { text: string; addIds?: number[] }[] = [];
  const has = (re: RegExp) => names.some(n => re.test(n));
  if (has(/TOUCH/i)) out.push({ text: box ? `Touch: в названии короба указать «${alu ? 'ALU TOUCH' : 'TOUCH'}»${o.height > 2300 ? '. Выше 2300 мм можно второй Touch вверху («TOUCH/2»)' : ''}` : 'Touch: выберите короб — в его названии нужно указать «TOUCH» или «ALU TOUCH»' });
  if (has(/WAVE/i)) out.push({ text: box ? `Wave: ответная планка «${alu ? 'Alutop' : 'Minimal'}»` : 'Wave: ответная планка зависит от короба — Alutop (алюминиевые) или Minimal (телескоп, компланарный, моноблок)' });
  if (has(/VITRA/i)) out.push({ text: 'Vitra: в названии короба указать «VITRA»; только со специальными ручками для Vitra' });
  if (has(/POLARIS/i)) out.push({ text: box ? `Polaris 190: ответная планка «${alu ? 'Alutop' : 'Minimal'}»` : 'Polaris 190: ответная планка Alutop (алюминиевые короба) или Minimal (телескоп, компланарный, моноблок)' });
  if (has(/^KM (WC|Lock)/i)) {
    const need: number[] = [];
    if (!has(/KM COVER/i)) { const c = idx.data.catalog.find(x => x.sheet === 'Замки' && /KM COVER/i.test(x.name)); if (c) need.push(c.id); }
    if (box && !has(/планка КМ/i)) { const p = idx.data.catalog.find(x => x.sheet === 'Замки' && new RegExp(`планка КМ ${alu ? 7 : 5}`, 'i').test(x.name)); if (p) need.push(p.id); }
    out.push({ text: `Замок KM: нужны лицевая накладка KM COVER и ответная планка ${box ? `КМ ${alu ? 7 : 5}` : 'КМ 7 (алюминиевые короба) или КМ 5 (телескоп, компланарный, моноблок)'}`, addIds: need.length ? need : undefined });
  }
  if (has(/Врезка под замок 190|190 мм/i) && !has(/POLARIS|^KM /i)) out.push({ text: 'Врезка под замок 190: сам замок (Polaris 190 или KM) покупается отдельно — добавьте из «Замков»' });
  return out;
}

const monoSheet = (series: string, rev: boolean) =>
  series === 'PE.O, NE.O' ? (rev ? 'Моноблок Reverse PE.O, NE.O' : 'Моноблок PE.O, NE.O')
  : (series === 'VE' || series === 'VT') ? (rev ? 'Моноблок Шпон Reverse' : 'Моноблок Шпон')
  : (rev ? 'Моноблок REVERSE ЭМАЛЬ' : 'Моноблок ЭМАЛЬ');

/** Позиции прайса для выбранного вида короба (сам короб и его наличники/доборы) */
export function boxItemMatches(it: Item, key: BoxKey, series: string): boolean {
  const n = it.name.toLowerCase();
  switch (key) {
    case 'mono': return it.sheet === monoSheet(series, false);
    case 'monoRev': return it.sheet === monoSheet(series, true);
    // погонаж серии: короб + наличники/доборы/планки того же раздела листа (разделы в прайсе подписаны не везде)
    case 'tele': return it.sheet === series && (/телескоп/i.test(it.section) || (/коробка телескоп|наличник|добор|притворная планка 8\*30|плинтус/.test(n) && !/компланарн/i.test(it.section + n)));
    case 'copl': return it.sheet === series && !/reverse/.test(n) && (/компланарн/i.test(it.section) || /компланарн/.test(n));
    case 'coplRev': return it.sheet === series && /reverse/.test(n) && (/компланарн/i.test(it.section) || /компланарн/.test(n));
    case 'integral': return it.sheet === 'INTEGRAL';
    case 'integralRev': return it.sheet === 'INTEGRAL Reverse';
    case 'slim': return it.sheet === 'Короб SLIM';
    case 'u60': return it.sheet === 'Короб INVISIBLE 60U';
    default: return boxKeyOf(it) === key;
  }
}

// ─── Что показывать в «Добавить из прайса» для выбранной серии ──────────────
export const ORANGE = ['P, N', 'PD', 'PE.O, NE.O', 'GE', 'SE.O'];
const NO_LOCK_SHEET = ['AG', 'AT', 'Серия FT EI30'];          // замок в комплектации полотна / в цене блока
const POLARIS_OK = ['Под покраску', 'GE', 'P, N', 'PD', 'PE.O, NE.O', 'SE.O']; // врезка под замок 190
const SYS_SHEETS: Record<string, string[]> = {
  slide: ['Раздвижные системы открывания'],
  magic: ['Раздвижные системы "MAGIC"'],
  book: ['Складные системы'],
  pivot: ['Поворотные системы'],
  penal: ['Системы "Пенал"'],
};

export interface PickCtx { sheet: string; model: string; openKind?: string; hingeSys?: string; finishCat?: number | null; profile?: string }

/** Подходит ли позиция к серии/открыванию проёма. null — серия не выбрана, показываем всё */
export function fitsOpening(idx: PriceIndex, it: Item, group: string, c: PickCtx | null): boolean {
  if (!c || !c.sheet) return true;
  const kind = c.openKind ?? 'swing';
  switch (group) {
    case 'box': {
      const systems = hingeSystems(c.sheet, c.model);
      const sys = kind === 'swing' || kind === 'book' ? currentSystem(c.sheet, c.model, kind === 'book' ? 'book' : c.hingeSys) : undefined;
      const allowed = sys ? sys.boxes : [...new Set(systems.flatMap(s => s.boxes))];
      if (!allowed.length) return false;
      // погонаж в двух ценах («Категория 1» / «Категория 2 и 3») — показываем под выбранное покрытие
      const cm = it.name.match(/Категори[яи]\s*([\d\s,/и]+)/i);
      if (cm && c.finishCat != null) {
        const cats = (cm[1].match(/\d/g) ?? []).map(Number);
        if (cats.length && !cats.includes(c.finishCat)) return false;
      }
      return allowed.some(k => boxItemMatches(it, k, c.sheet));
    }
    case 'hinge': {
      if (kind !== 'swing' && kind !== 'book') return false;
      const sys = currentSystem(c.sheet, c.model, kind === 'book' ? 'book' : c.hingeSys);
      const f = hingeFamilyOf(it);
      return !!sys && !!f && sys.families.includes(f);
    }
    case 'lock': {
      if (it.sheet !== 'Замки') return false;
      const n = it.name;
      if (c.sheet === 'Серия FT EI30') return false;
      if (NO_LOCK_SHEET.includes(c.sheet)) return /планка КМ/i.test(n);       // Krona в комплектации — докупается только ответная планка
      if (/POLARIS/i.test(n)) return POLARIS_OK.includes(c.sheet);
      if (/^(TOUCH|WAVE|VITRA)/i.test(n.trim())) return false;   // Touch, Wave, Vitra — комплектации полотна, выбираются в «Опциях полотна»
      return true;   // KM, накладки, ответные планки
    }
    case 'handle':   // ручки обеих линеек подходят к любой серии; свои — показываем первыми
      return it.sheet === 'Дверные ручки Orange' || it.sheet === 'Дверные ручки';
    case 'sys':
      return (SYS_SHEETS[kind] ?? []).includes(it.sheet);
    case 'other':
      if (it.sheet === 'Стеновые панели "EGGER"') return ORANGE.includes(c.sheet);
      if (it.sheet === 'Стеновые панели V' || it.sheet === 'Плинтуса алюминиевые') return !ORANGE.includes(c.sheet);
      return true;
    default:
      return true;
  }
}

/** Почему в разделе пусто — объяснение для менеджера */
export function emptyReason(group: string, c: PickCtx | null): string {
  if (!c) return '';
  const kind = c.openKind ?? 'swing';
  if (group === 'hinge') {
    if (kind !== 'swing' && kind !== 'book') return 'Для этого открывания петли не нужны — система открывания идёт отдельно.';
    const sys = currentSystem(c.sheet, c.model, kind === 'book' ? 'book' : c.hingeSys);
    if (sys?.included) return sys.included + '.';
  }
  if (group === 'lock' && c.sheet === 'Серия FT EI30') return 'В противопожарном блоке замок уже в цене.';
  if (group === 'lock') return 'Touch, Wave и Vitra выбираются в «Опциях полотна».';
  if (group === 'sys' && kind === 'swing') return 'Для распашной двери система открывания не нужна. Выберите в проёме другое открывание (раздвижное, «Книжка», Pivot…).';
  if (group === 'box') return 'Для этого открывания отдельный короб в прайсе не указан.';
  return '';
}
