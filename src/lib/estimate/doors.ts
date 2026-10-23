/**
 * Прайс полотен PROFILDOORS ORANGE — перенесён из таблицы
 * «Просчет ProfilDoors Orange» (формулы сняты с листов PD, PM, PD.O … AX.O).
 *
 * Цена полотна = базовая цена модели × коэффициент размера (высота × ширина)
 *   + перламутр/элегант: либо ×1.15 (PD, PM, PE), либо +38 956 ₸ до умножения (PD.O, P.O, PE.O)
 *   + для AV.O и AX.O к результату прибавляется 55 640 ₸ (так в таблице).
 */

export interface Bracket { label: string; min: number; max: number }
export interface SizeGrid {
  heights: Bracket[];
  widths: Bracket[];
  /** k[i][j] — коэффициент для высоты i и ширины j */
  k: number[][];
}
export type PerlRule = { kind: 'mul'; k: number } | { kind: 'add'; amount: number };

export interface DoorOption { id: string; label: string; add?: number; pct?: number; group?: 'lock' }
export interface ModelPrice { model: string; fill?: string; price: number }
export interface Transom { label: string; base: number; perl?: number }

export interface Series {
  id: string;
  name: string;           // как в прайсе: «PD.O Ин.Эм.»
  group: string;          // для группировки в списке
  colors: string;         // базовые цвета
  perlColors?: string;    // перламутр / элегант
  perl?: PerlRule;
  grid: SizeGrid;
  extra?: number;         // постоянная добавка к цене (AV.O / AX.O)
  options: DoorOption[];
  models: ModelPrice[];
  /** «Модель полотна»: подписи групп заполнения — Филенка, Стекло 1 … или Категория 1 … */
  fillNote?: string;
  transoms?: Transom[];   // верхняя фрамуга, цена за м²
}

const grid = (heights: [string, number, number, number][], widths: [string, number, number, number][]): SizeGrid => ({
  heights: heights.map(([label, min, max]) => ({ label, min, max })),
  widths: widths.map(([label, min, max]) => ({ label, min, max })),
  k: heights.map(h => widths.map(w => round4(h[3] * w[3]))),
});
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// Сетки размеров (коэффициенты сняты с формул таблицы)
const G_PD = grid(
  [['1600–2000', 1600, 2000, 1], ['2050–2100', 2001, 2100, 1.05], ['2150–2300', 2101, 2300, 1.1], ['2350–2400', 2301, 2400, 1.3]],
  [['400–800', 400, 800, 1], ['850–900', 801, 900, 1.1], ['950–1000', 901, 1000, 1.2]],
);
const G_O = grid(
  [['1800–2000', 1800, 2000, 1], ['2050–2250', 2001, 2250, 1.1], ['2300', 2251, 2300, 1.2]],
  [['600–800', 600, 800, 1], ['850–900', 801, 900, 1.1]],
);
const G_EO = grid(
  [['1800–2100', 1800, 2100, 1], ['2105–2400', 2101, 2400, 1.2], ['2405–3000', 2401, 3000, 1.4]],
  // по прайсу: ширина от 300 мм (отдельные модели), свыше 1000 до 1200 мм — только раздвижные (+30%)
  [['300–800', 300, 800, 1], ['810–900', 801, 900, 1.1], ['910–1000', 901, 1000, 1.2], ['1010–1200 (раздвижные)', 1001, 1200, 1.3]],
);
const G_PE = grid(
  [['1800–2100', 1800, 2100, 1], ['2101–2400', 2101, 2400, 1.2], ['2401–3000', 2401, 3000, 1.3]],
  [['300–800', 300, 800, 1], ['805–900', 801, 900, 1.1], ['905–1000', 901, 1000, 1.2], ['1005–1200 (раздвижные)', 1001, 1200, 1.3]],
);
// Алюминиевые AP.O / AV.O / AX.O — коэффициенты в таблице не перемножаются
const G_AL: SizeGrid = {
  heights: [{ label: '1800–2100', min: 1800, max: 2100 }, { label: '2105–2800', min: 2101, max: 2800 }],
  widths: [{ label: '400–800', min: 400, max: 800 }, { label: '850–900', min: 801, max: 900 }, { label: '950–1000', min: 901, max: 1000 }, { label: '1050–1200 (раздвижные)', min: 1001, max: 1200 }],
  k: [[1, 1.1, 1.2, 1.3], [1.2, 1.3, 1.4, 1.5]],
};

const BASE = 'Вайт, Крем Вайт, Кремовая Магнолия, Сэнд, Лайт Грей, Смоки, Графит, Блэк';
const PERL = 'Перламутр белый, Перламутр бронза';
const ELEG = 'Перламутр белый, Перламутр бронза; Элегант: Перламутр белый, Графит, Перламутр Бронза, Лайт Грей, Блэк';
const UNILACK = 'Аляска, Дарк Вайт, Магнолия, Грей';
const TEXT = 'Дуб натуральный, Дуб Мокко, Орех шоколад';
const NOTEXT = 'Дуб Карамель, Дуб Сонома, Дуб Тобакко';
const ALU = 'Каркас: Серебро, Черный, Черный муар, Вайт, Серая ночь, Шампань, Никель, Деоре, Золото, Бронза, Медь';
const GLASS = 'Стекло 1 — прозрачные (Прозрачное, Матовое, Графит матовое); Стекло 2 — цветные (Черное тонированное, Золотистая бронза, Золотистая бронза матовое); Стекло 3 — декоративные (Страйп, Град, Мору осветленное)';

const opt = {
  v19: { id: 'v', label: 'В-Полотно', add: 19394 } as DoorOption,
  v21: { id: 'v', label: 'В-Полотно', add: 21054 } as DoorOption,
  v25: { id: 'v', label: 'В-Полотно', add: 25887 } as DoorOption,
  mirror127: { id: 'mirror', label: 'Зеркало с одной стороны', add: 127151 } as DoorOption,
  mirror156: { id: 'mirror', label: 'Зеркало с одной стороны', add: 156588 } as DoorOption,
  rev5: { id: 'rev', label: 'Полотно REVERSE', pct: 5 } as DoorOption,
  revInf10: { id: 'revinf', label: 'Полотно REVERSE INFINITY', pct: 10 } as DoorOption,
  rev8489: { id: 'rev', label: 'Полотно REVERSE', add: 8489 } as DoorOption,
  revInf16957: { id: 'revinf', label: 'Полотно REVERSE INFINITY', add: 16957 } as DoorOption,
};

// Комплектации замка (прайс май 2026) — выбирается одна
const LK = {
  touch: { id: 'lk_touch', label: 'AGB TOUCH', add: 66482, group: 'lock' } as DoorOption,
  touchWc: { id: 'lk_touchwc', label: 'AGB TOUCH WC', add: 92509, group: 'lock' } as DoorOption,
  wave: { id: 'lk_wave', label: 'AGB WAVE (скрытая ручка)', add: 195888, group: 'lock' } as DoorOption,
  waveWc: { id: 'lk_wavewc', label: 'AGB WAVE WC (скрытая ручка)', add: 231769, group: 'lock' } as DoorOption,
  vitra: { id: 'lk_vitra', label: 'AGB VITRA', add: 60676, group: 'lock' } as DoorOption,
  vitraWc: { id: 'lk_vitrawc', label: 'AGB VITRA WC', add: 60676, group: 'lock' } as DoorOption,
};
const LOCK36 = [LK.touch, LK.touchWc, LK.wave, LK.waveWc];
const LOCK44 = [LK.touch, LK.touchWc, LK.vitra, LK.vitraWc, LK.wave, LK.waveWc];
// Доп. опции каркасных полотен 44 мм
const EXTRA44: DoorOption[] = [
  { id: 'closer', label: 'Усиление под доводчик', add: 29088 },
  { id: 'noise', label: 'Шумоизоляция', add: 99009 },
  { id: 'vent', label: 'Вентрешётка', add: 33780 },
  { id: 'hinge', label: 'Под доп. петлю', add: 7333 },
  { id: 'cable', label: 'Под кабель-канал', add: 22014 },
];
const PANEL_PE: DoorOption[] = [
  { id: 'panelFabric', label: 'Сторонняя тканевая панель', add: 100038 },
  { id: 'panelStone', label: 'Сторонняя панель из керамогранита', add: 100038 },
];

// Наборы «Филенка / Стекло 1-3» — удобная запись строк прайса
const f = (model: string, price: number): ModelPrice => ({ model, fill: 'Филенка', price });
const g = (model: string, s1: number, s2: number, s3: number): ModelPrice[] => [
  { model, fill: 'Стекло 1', price: s1 }, { model, fill: 'Стекло 2', price: s2 }, { model, fill: 'Стекло 3', price: s3 },
];
const one = (model: string, fill: string, price: number): ModelPrice => ({ model, fill, price });
const cats = (model: string, ...prices: number[]): ModelPrice[] => prices.map((price, i) => ({ model, fill: `Категория ${i + 1}`, price }));

// ── PD ──
const PD_A = [169595, 181039, 203921] as const;
const PD_B = [174414, 185858, 208740] as const;
const PD_R = [196350, 207795, 230677] as const;
const PD_MODELS: ModelPrice[] = [
  f('1.1.1 PD – 1.3.1 PD', 174414), ...g('1.1.2 PD – 1.3.2 PD', ...PD_A), ...g('1.3.3 PD – 1.3.4 PD', ...PD_B),
  ...g('1.1.2 PD (р.8/р.15), 1.2.2 PD (р.6/р.12)', ...PD_R),
  f('1.5.1 PD', 174414), ...g('1.5.2 PD', ...PD_A), ...g('1.5.3 PD – 1.5.4 PD', ...PD_B),
  f('1.7.1 PD – 1.8.1 PD', 174414), ...g('1.7.2 PD – 1.8.2 PD', ...PD_A),
  f('2.1.1 PD – 2.2.1 PD', 174414), ...g('2.1.2 PD – 2.2.2 PD', ...PD_A), ...g('2.3.3 PD – 2.3.4 PD', ...PD_B), ...g('2.1.2 PD (р.8)', ...PD_R),
  f('2.5.1 PD', 174414), ...g('2.5.2 PD', ...PD_A), ...g('2.5.3 PD – 2.5.4 PD', ...PD_B),
  f('2.7.1 PD', 174414), ...g('2.7.2 PD', ...PD_A),
  f('3.1.1 PD – 3.2.1 PD', 174414), ...g('3.1.2 PD – 3.2.2 PD', ...PD_A), ...g('3.1.2 PD (р.8), 3.2.2 PD (р.6)', ...PD_R),
  f('3.5.1 PD', 174414), ...g('3.5.2 PD – 3.5.4 PD', ...PD_A),
  f('4.1.1 PD – 4.2.1 PD', 174414), ...g('4.1.2 PD – 4.2.2 PD', ...PD_A), ...g('4.3.3 PD', ...PD_B), ...g('4.1.2 PD (р.8/р.15), 4.2.2 PD (р.6)', ...PD_R),
  f('4.5.1 PD', 174414), ...g('4.5.2 PD', ...PD_A), ...g('4.5.3 PD – 4.5.4 PD', ...PD_B),
];
const PM_G = [156525, 167970, 190852] as const;
const PM_MODELS: ModelPrice[] = [
  f('1.1.1 PM – 1.2.1 PM', 161330), ...g('1.1.2 PM – 1.2.2 PM', ...PM_G),
  f('2.1.1 PM – 2.3.1 PM', 161330), ...g('2.2.2 PM – 2.3.2 PM', ...PM_G),
  f('3.1.1 PM – 3.3.1 PM', 161330), ...g('3.2.2 PM – 3.3.2 PM', ...PM_G),
  ...g('3.5.1 PM', ...PM_G), ...g('3.5.2 PM', ...PM_G), f('3.6.1 PM', 161330),
];
const PD_TRANSOMS: Transom[] = [
  { label: 'Филенка / Стекло 1', base: 158739, perl: 182550 },
  { label: 'Стекло 2', base: 183841, perl: 211417 },
  { label: 'Стекло 3', base: 192666, perl: 221566 },
];

// ── PD.O / ND.O (одинаковые цены) ──
const O_HI = [134645, 146089, 168972] as const;
const O_LO = [112204, 123649, 146531] as const;
const pdo = (suf: string): ModelPrice[] => [
  f(`5.1.1 ${suf} – 5.3.1 ${suf}`, 134645), ...g(`5.1.2 ${suf} – 5.3.2 ${suf}`, ...O_HI),
  f(`6.1.1 ${suf} – 6.3.1 ${suf}`, 134645), ...g(`6.1.2 ${suf} – 6.3.2 ${suf}`, ...O_HI),
  f(`7.1.1 ${suf} – 7.3.1 ${suf}`, 134645), ...g(`7.1.2 ${suf} – 7.3.2 ${suf}`, ...O_HI),
  f(`8.1.1 ${suf} – 8.3.1 ${suf}`, 134645), ...g(`8.1.2 ${suf} – 8.3.2 ${suf}`, ...O_HI),
  f(`9.1.1 ${suf} – 9.3.1 ${suf}`, 112204), ...g(`9.1.2 ${suf} – 9.3.2 ${suf}`, ...O_LO),
  f(`10.1.1 ${suf} – 10.3.1 ${suf}`, 112204), ...g(`10.1.2 ${suf} – 10.3.2 ${suf}`, ...O_LO),
  f(`11.1.1 ${suf} – 11.2.1 ${suf}`, 134645), ...g(`11.1.2 ${suf} – 11.2.2 ${suf}`, ...O_HI),
];
const O_TRANSOMS_IE: Transom[] = [
  { label: 'Филенка / Стекло 1', base: 101614, perl: 142259.6 },
  { label: 'Стекло 2', base: 111770, perl: 156478 },
  { label: 'Стекло 3', base: 132095, perl: 184933 },
];

// ── P.O / N.O ──
const po = (suf: string, p: { a: number; b: number; c: number; t: number; d?: number }): ModelPrice[] => [
  one(`1.1 ${suf}`, 'Филенка', p.a), one(`1.2 ${suf}`, 'Вставка стекла с молдингом', p.a),
  one(`1.3 ${suf}`, 'Филенка', p.b), one(`1.4 ${suf}`, 'Вставка стекла с молдингом', p.a),
  one(`1.7 ${suf}`, 'Вставка стекла с молдингом', p.c), one(`1.8 ${suf}`, 'Вставка стекла с молдингом', p.a),
  one(`1.9 ${suf}`, 'Вставка стекла с молдингом', p.b),
  ...(p.d ? [one(`1.12 ${suf}`, 'Филенка', p.d)] : []),
  one(`1.13 ${suf}`, 'Триплекс', p.t),
];

// ── PE.O / NE.O (Ин.Эм. и Текстура — одинаковые цены) ──
const EO_PRICES: [number, number][] = [
  [1, 153009], [41, 168292], [42, 168292], [43, 168292], [44, 168292], [45, 183603], [46, 198914], [47, 198914],
  [48, 198914], [49, 198914], [50, 198914], [51, 198914], [52, 183603], [53, 183603], [54, 183603], [55, 198914],
  [56, 168292], [57, 168292], [58, 198914], [59, 198914], [60, 168292], [61, 198914], [62, 198914], [63, 198914],
  [64, 198914], [65, 183603],
];
const eo = (suf: string) => EO_PRICES.map(([n, price]) => ({ model: `${n} ${suf}`, price }));
const PE_PRICES: [number, number][] = [
  [2, 282534], [3, 282534], [4, 291857], [6, 297446], [7, 282534], [8, 282534], [10, 297446], [11, 219134], [12, 272105],
  [13, 237029], [14, 237029], [15, 272105], [16, 219134], [17, 237029], [18, 237029], [19, 272105], [20, 272105],
  [21, 237029], [22, 347223], [23, 272105], [24, 237029], [25, 282534], [26, 282534], [27, 291857], [28, 282534],
  [30, 282534], [31, 291857], [32, 282534], [34, 282534], [36, 291857], [37, 291857],
];

const AV_HI = [373292, 488690, 488690, 568886];
const AV_LO = [341116, 446029, 446029, 518919];

export const SERIES: Series[] = [
  // Царговые в однотонном покрытии
  { id: 'PD', name: 'PD', group: 'Царговые', colors: BASE, perlColors: PERL, perl: { kind: 'mul', k: 1.15 }, grid: G_PD,
    options: [opt.v21, ...LOCK36], models: PD_MODELS, fillNote: GLASS, transoms: PD_TRANSOMS },
  { id: 'PM', name: 'PM', group: 'Царговые', colors: BASE, perlColors: PERL, perl: { kind: 'mul', k: 1.15 }, grid: G_PD,
    options: [opt.v21, ...LOCK36], models: PM_MODELS, fillNote: GLASS + '. Модели 3.5.1, 3.5.2, 3.6.1 — ширина 600–1000 мм', transoms: PD_TRANSOMS },
  { id: 'PDO_IE', name: 'PD.O Ин.Эм.', group: 'Царговые', colors: BASE, perlColors: PERL, perl: { kind: 'add', amount: 38956 }, grid: G_O,
    options: [opt.v19, ...LOCK36], models: pdo('PD.O'), fillNote: GLASS, transoms: O_TRANSOMS_IE },
  { id: 'PDO_UN', name: 'PD.O Unilack', group: 'Царговые', colors: UNILACK, grid: G_O, options: [opt.v19, ...LOCK36],
    models: [
      f('9.1.1 PD.O – 9.3.1 PD.O', 102847), ...g('9.1.2 PD.O – 9.3.2 PD.O', 102847, 114291, 137173),
      f('10.1.1 PD.O – 10.3.1 PD.O', 102847), ...g('10.1.2 PD.O – 10.3.2 PD.O', 102847, 114291, 137173),
      f('11.1.1 PD.O – 11.2.1 PD.O', 125288), ...g('11.1.2 PD.O – 11.2.2 PD.O', 125288, 136732, 159614),
    ], fillNote: GLASS,
    transoms: [{ label: 'Филенка / Стекло 1', base: 82227 }, { label: 'Стекло 2', base: 92369 }, { label: 'Стекло 3', base: 112694 }] },
  { id: 'PO_IE', name: 'P.O Ин.Эм.', group: 'Царговые', colors: BASE, perlColors: ELEG, perl: { kind: 'add', amount: 38956 }, grid: G_O,
    options: [opt.v19, ...LOCK36], models: po('P.O', { a: 134645, b: 148107, c: 154844, d: 154844, t: 269276 }),
    transoms: [{ label: 'К моделям 1.1–1.12 P.O', base: 101614, perl: 142259.6 }, { label: 'К модели 1.13 P.O', base: 176711, perl: 247395.4 }] },
  { id: 'PO_UN', name: 'P.O Unilack', group: 'Царговые', colors: UNILACK, grid: G_O, options: [opt.v19, ...LOCK36],
    models: po('P.O', { a: 125288, b: 138749, c: 145487, t: 259918 }),
    transoms: [{ label: 'К моделям 1.1–1.9 P.O', base: 95451 }, { label: 'К модели 1.13 P.O', base: 170575 }] },
  // Царговые в древесном покрытии
  { id: 'NDO', name: 'ND.O Текстура', group: 'Царговые древесные', colors: TEXT, grid: G_O, options: [opt.v19, ...LOCK36], models: pdo('ND.O'), fillNote: GLASS,
    transoms: [{ label: 'Филенка / Стекло 1', base: 101614 }, { label: 'Стекло 2', base: 111770 }, { label: 'Стекло 3', base: 132095 }] },
  { id: 'NO_T', name: 'N.O Текстура', group: 'Царговые древесные', colors: TEXT, grid: G_O, options: [opt.v19, ...LOCK36],
    models: po('N.O', { a: 134645, b: 148107, c: 154844, d: 154844, t: 269276 }),
    transoms: [{ label: 'К моделям 1.1–1.12 N.O', base: 101614 }, { label: 'К модели 1.13 N.O', base: 176711 }] },
  { id: 'NO_NT', name: 'N.O без Текстур', group: 'Царговые древесные', colors: NOTEXT, grid: G_O, options: [opt.v19, ...LOCK36],
    models: po('N.O', { a: 115944, b: 129406, c: 136130, t: 250589 }),
    transoms: [{ label: 'К моделям 1.1–1.9 N.O', base: 89343 }, { label: 'К модели 1.13 N.O', base: 164440 }] },
  // Каркасные
  { id: 'PAINT', name: 'Под покраску', group: 'Каркасные', colors: 'Под покраску (PW — алюминиевый каркас, PE — деревянный каркас с АБС кромкой)', grid: G_EO,
    options: [opt.v21, opt.mirror127, opt.rev5, opt.revInf10, ...LOCK44, ...EXTRA44],
    models: [{ model: '0 PE.O', price: 130057 }, { model: '0 PE.O Reverse', price: 136557 }] },
  { id: 'PE', name: 'PE', group: 'Каркасные', colors: `${BASE}. ${ALU}`, perlColors: ELEG, perl: { kind: 'mul', k: 1.15 }, grid: G_PE,
    options: [opt.v25, opt.mirror156, opt.rev8489, opt.revInf16957, ...LOCK44, ...EXTRA44, ...PANEL_PE],
    models: PE_PRICES.map(([n, price]) => ({ model: `${n} PE`, price })),
    transoms: [{ label: 'Верхняя фрамуга', base: 131430, perl: 151145 }] },
  { id: 'PEO_IE', name: 'PE.O Ин.Эм.', group: 'Каркасные', colors: `${BASE}. ${ALU}`, perlColors: ELEG, perl: { kind: 'add', amount: 38956 }, grid: G_EO,
    options: [opt.v21, opt.mirror127, opt.rev5, opt.revInf10, ...LOCK44, ...EXTRA44], models: eo('PE.O'),
    transoms: [{ label: 'Верхняя фрамуга', base: 120483, perl: 159439 }] },
  { id: 'PEO_UN', name: 'PE.O Unilack', group: 'Каркасные', colors: `${UNILACK}. ${ALU}`, grid: G_EO,
    options: [opt.v21, opt.mirror127, opt.rev5, opt.revInf10, ...LOCK44, ...EXTRA44],
    models: [[1, 143666], [11, 177061], [12, 235208], [13, 190523], [14, 190523], [18, 190523], [19, 235208]].map(([n, price]) => ({ model: `${n} PE.O`, price })),
    transoms: [{ label: 'Верхняя фрамуга', base: 120483 }] },
  { id: 'NEO_T', name: 'NE.O Текстура', group: 'Каркасные древесные', colors: `${TEXT}. ${ALU}`, grid: G_EO,
    options: [opt.v21, opt.mirror127, opt.rev5, opt.revInf10, ...LOCK44, ...EXTRA44], models: eo('NE.O'),
    transoms: [{ label: 'Верхняя фрамуга', base: 120483 }] },
  { id: 'NEO_NT', name: 'NE.O без Текстур', group: 'Каркасные древесные', colors: `${NOTEXT}. ${ALU}`, grid: G_EO,
    options: [opt.v21, opt.mirror127, opt.rev5, opt.revInf10, ...LOCK44, ...EXTRA44],
    models: [[1, 134309], [11, 158346], [12, 225865], [13, 181165], [14, 181165], [18, 181165], [19, 225865]].map(([n, price]) => ({ model: `${n} NE.O`, price })),
    transoms: [{ label: 'Верхняя фрамуга', base: 118886 }] },
  // Алюминиевые
  { id: 'APO', name: 'AP.O', group: 'Алюминиевые', colors: `${ALU}. Внутренняя панель: Категория 1 — ${BASE}; Категория 2 — ${PERL}; Категория 3 — Элегант`, grid: G_AL,
    options: [opt.v21], models: cats('1 AP.O', 286422, 329391, 329391) },
  { id: 'AVO', name: 'AV.O', group: 'Алюминиевые', colors: ALU, grid: G_AL, extra: 55640, options: [opt.v21],
    fillNote: 'Категория 1 — эмалированные и светопропускаемые стекла, зеркала; 2 — с зеркальным эффектом, цветные, декоративные; 3 — рифлёные с одной стороны; 4 — рифлёные с зеркальным эффектом, рифлёные эмалированные',
    models: [...cats('1 AV.O', ...AV_LO), ...['2', '3', '4', '6', '13', '14', '18', '21', '22'].flatMap(n => cats(`${n} AV.O`, ...AV_HI))],
    transoms: [{ label: 'Верхняя фрамуга, кат. 1', base: 210652 }, { label: 'Верхняя фрамуга, кат. 2–3', base: 279348 }, { label: 'Верхняя фрамуга, кат. 4', base: 327066 }] },
  { id: 'AXO', name: 'AX.O', group: 'Алюминиевые', colors: ALU, grid: G_AL, extra: 55640, options: [opt.v21],
    fillNote: 'Категория 1 — эмалированные и светопропускаемые стекла, зеркала; 2 — с зеркальным эффектом, цветные, декоративные; 3 — рифлёные с одной стороны; 4 — рифлёные с зеркальным эффектом, рифлёные эмалированные',
    models: [...cats('1 AX.O', ...AV_LO), ...['2', '3', '4', '5', '6'].flatMap(n => cats(`${n} AX.O`, ...AV_HI))],
    transoms: [{ label: 'Верхняя фрамуга, кат. 1', base: 210652 }, { label: 'Верхняя фрамуга, кат. 2–3', base: 279348 }, { label: 'Верхняя фрамуга, кат. 4', base: 327066 }] },
];

export function findBracket(list: Bracket[], v: number): number {
  return list.findIndex(b => v >= b.min && v <= b.max);
}

export interface DoorCalc {
  ok: boolean;
  error?: string;
  k?: number;
  unit?: number;            // цена полотна за 1 шт
  breakdown?: string;
}

/** Цена одного полотна по правилам таблицы */
export function calcDoor(s: Series, basePrice: number, height: number, width: number, perl: boolean, optionIds: string[]): DoorCalc {
  const hi = findBracket(s.grid.heights, height);
  const wi = findBracket(s.grid.widths, width);
  if (hi < 0) return { ok: false, error: `Высота ${height} мм вне прайса (${s.grid.heights.map(h => h.label).join(', ')})` };
  if (wi < 0) return { ok: false, error: `Ширина ${width} мм вне прайса (${s.grid.widths.map(w => w.label).join(', ')})` };
  const k = s.grid.k[hi][wi];
  let price: number;
  if (perl && s.perl?.kind === 'add') price = (basePrice + s.perl.amount) * k;
  else if (perl && s.perl?.kind === 'mul') price = basePrice * k * s.perl.k;
  else price = basePrice * k;
  if (s.extra) price += s.extra;
  const parts = [`база ${fmt(basePrice)}`, `×${k}`];
  if (perl && s.perl) parts.push(s.perl.kind === 'add' ? `+ перламутр ${fmt(s.perl.amount)} (до умножения)` : `× ${s.perl.k} перламутр`);
  if (s.extra) parts.push(`+ ${fmt(s.extra)}`);
  const sel = s.options.filter(o => optionIds.includes(o.id));
  const pctTotal = sel.reduce((a, o) => a + (o.pct ?? 0), 0);
  const addTotal = sel.reduce((a, o) => a + (o.add ?? 0), 0);
  if (pctTotal) { price = price * (1 + pctTotal / 100); parts.push(`+${pctTotal}%`); }
  if (addTotal) { price += addTotal; parts.push(`+ ${fmt(addTotal)}`); }
  return { ok: true, k, unit: Math.round(price * 100) / 100, breakdown: parts.join(' ') };
}

export const fmt = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`;
