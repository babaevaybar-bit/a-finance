/**
 * Фурнитура: цвета позиций (из пояснений прайса «Цвета покраски COMIT: … PROFILDOORS: …»)
 * и «что должно быть в комплекте» на дверь — замок, ручка, завертка/цилиндр, один цвет.
 */
import HW from '@/data/hardware-colors.json';
import type { Item, Opening, PriceIndex } from '@/lib/price';
import { catOfItem } from '@/lib/price';

const COLORS = HW as Record<string, string[]>;
/** Цвета позиции. У замков/накладок/планок цвет уже в названии — там undefined */
export function hwColors(it: Item): string[] | undefined {
  const c = COLORS[String(it.id)];
  return c && c.length ? c : undefined;
}
/** «COMIT» / «PROFILDOORS» / «FIMET»… — чей цвет у варианта позиции */
export function hwBrand(it: Item): string {
  const b = (it.attrs[it.attrs.length - 1] ?? '').trim();
  return b && !/шт/.test(b) ? b : '';
}
export const PD_COLORS_NOTE = 'Цвета PROFILDOORS — фурнитура окрашивается в цвета алюминиевой кромки двери (Серебро, Черный, Вайт, Шампань, Никель). Цвета COMIT, AGB и др. — заводские покрытия (хром, золото, бронза…).';
export function brandLabel(it: Item): string {
  const b = hwBrand(it);
  if (/PROFILDOORS/i.test(b)) return 'Покраска PROFILDOORS — в цвет кромки двери';
  if (b && !/^Италия$/i.test(b)) return `Заводской цвет ${b}`;
  return 'Стандарт';
}

const normC = (s: string) => s.toLowerCase().replace(/\(покраска\)/, '').replace(/\s+/g, ' ').trim();
/** Цвет строки сметы: свой (выбран) или из названия («Замок …, хром матовый») */
export function lineColor(it: Item, color?: string): string | null {
  if (color) return normC(color);
  if (it.sheet === 'Замки') { const m = it.name.match(/,\s*([^,]+)$/); return m ? normC(m[1]) : null; }
  return null;
}

const ACC = /^\s*(завертк|розетк|накладк|цилиндр|фиксатор|вставк)/i;
export type KitRow = { label: string; ok: boolean | null; text: string };
/** Чек-лист фурнитуры распашной двери. ok: true — есть, false — не хватает, null — не обязательно */
export function hardwareChecklist(idx: PriceIndex, o: Opening): KitRow[] {
  const lines = o.extras.map(l => ({ l, it: idx.byId.get(l.itemId) })).filter((x): x is { l: typeof x.l; it: Item } => !!x.it);
  const locks = lines.filter(x => catOfItem(x.it) === 'lock' && !/накладк|планка/i.test(x.it.name));
  const handles = lines.filter(x => catOfItem(x.it) === 'handle' && !ACC.test(x.it.name));
  const accs = lines.filter(x => catOfItem(x.it) === 'handle' && ACC.test(x.it.name));
  const rows: KitRow[] = [];
  const inDoor = ['AG', 'AT'].includes(o.sheet);
  const lockName = locks.map(x => x.it.name).join(' ');
  if (o.sheet === 'Серия FT EI30') return [{ label: 'Фурнитура', ok: true, text: 'Замок, ручки, петли и доводчик уже в цене противопожарного блока' }];
  rows.push(locks.length || inDoor
    ? { label: 'Замок', ok: true, text: inDoor ? 'в комплектации полотна' : locks.map(x => x.it.name.replace(/^Замок магнитный /, '')).join('; ') }
    : { label: 'Замок', ok: false, text: 'не выбран. Обычно магнитный: AGB Polaris 190 или KM. WC — с фиксатором (санузел), LOCK — под ключ (цилиндр), без фиксатора — комнаты' });
  rows.push(handles.length
    ? { label: 'Ручка', ok: true, text: handles.map(x => x.it.name).join('; ') }
    : { label: 'Ручка', ok: /TOUCH|WAVE/i.test(lockName) ? null : false, text: 'не выбрана. Комплект на дверь: 2 ручки, квадрат, 2 розетки' });
  const wc = /\bWC\b/i.test(lockName), cyl = /LOCK|цилиндр/i.test(lockName) && !/WC/i.test(lockName);
  if (wc) {
    const has = accs.some(x => /завертк|фиксатор/i.test(x.it.name));
    rows.push({ label: 'Завертка WC', ok: has, text: has ? 'есть' : 'замок WC — нужна завертка WC в цвет ручки (под розетку своей ручки)' });
  } else if (cyl) {
    const ros = accs.some(x => /розетк.*цилиндр|накладк.*цилиндр/i.test(x.it.name));
    const cy = accs.some(x => /^цилиндр/i.test(x.it.name.trim()));
    rows.push({ label: 'Под ключ', ok: ros && cy, text: ros && cy ? 'розетка и цилиндр есть' : `замок под ключ — нужны ${[!ros && 'розетка под цилиндр', !cy && 'цилиндр (ключ/ключ или ключ/завертка)'].filter(Boolean).join(' и ')}` });
  }
  // Цвет: ручка, завертка, розетки, накладки замка — в одном цвете
  const colored = [...handles, ...accs, ...lines.filter(x => catOfItem(x.it) === 'lock')];
  const noColor = colored.filter(x => hwColors(x.it) && !x.l.color);
  const cols = [...new Set(colored.map(x => lineColor(x.it, x.l.color)).filter((c): c is string => !!c))];
  if (colored.length) {
    rows.push(noColor.length
      ? { label: 'Цвет', ok: false, text: `не выбран у: ${noColor.map(x => x.it.name.replace(/^ручка\s+/i, '')).join(', ')}` }
      : cols.length > 1
        ? { label: 'Цвет', ok: false, text: `разные цвета: ${cols.join(', ')} — проверьте, что так задумано (ручку, завертку и розетки обычно берут в одном цвете)` }
        : { label: 'Цвет', ok: true, text: cols[0] ?? 'стандарт' });
  }
  return rows;
}
