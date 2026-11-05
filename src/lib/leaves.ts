import { categoryOption, finishCategory, insertBlocks, leafOf, type Item, type Opening, type PriceIndex } from '@/lib/price';

/** Сторона полотна: своя или по умолчанию (в двустворчатых — левые слева, правые справа) */
export function sideOf(o: Opening, i: number): 'L' | 'R' | undefined {
  const n = Math.max(1, o.leaves || 1);
  const s = o.leafSet?.[i]?.side;
  if (s) return s;
  if (n === 1) return undefined;
  return i < n / 2 ? 'L' : 'R';
}

/** Категория стекла/вставки на полотне (по блоку прайса, где оно перечислено) */
export function insertCategory(idx: PriceIndex, o: Opening, i: number): number | null {
  const s = idx.series.get(o.sheet);
  const lf = leafOf(o, i);
  if (!s || !lf.insert) return null;
  const v = lf.variantId != null ? idx.variant.get(lf.variantId) : undefined;
  const bl = insertBlocks(s, lf.model, v?.v.label ?? '').find(b => b.lists.some(l => l.items.includes(lf.insert!)));
  return bl?.cat ?? null;
}

/**
 * Наценки «за категорию покрытия» и «Стекло 2» — по числу полотен, у которых такой цвет/стекло.
 * Полотнам 2…N со своим цветом у моделей с ценой по категориям — свой вариант цены.
 */
export function syncLeafSurcharges(idx: PriceIndex, x: Opening) {
  const s = idx.series.get(x.sheet);
  if (!s) return;
  const n = Math.max(1, x.leaves || 1);
  // свой вариант цены у полотен 2…N по категории их цвета
  for (let i = 1; i < n; i++) {
    const c = x.leafSet?.[i];
    if (!c?.model || !c.finish) continue;
    const cat = finishCategory(s, c.finish);
    const m = s.models.find(mm => mm.code === c.model);
    const v = cat != null ? m?.variants.find(vv => new RegExp(`Категория ${cat}(\\D|$)`).test(vv.label)) : undefined;
    if (v) c.variantId = v.id;
  }
  const catItems = new Map<number, { it: Item; cnt: number }>();
  for (const c of [1, 2, 3, 4]) { const it = categoryOption(idx, s, c); if (it && !catItems.has(it.id)) catItems.set(it.id, { it, cnt: 0 }); }
  const glass = s.options.map(id => idx.byId.get(id)).filter((it): it is Item => !!it && /остеклени/i.test(it.name) && /Стекло \d/.test(it.name));
  const glassCnt = new Map<number, number>();
  let anyFinish = false;
  for (let i = 0; i < n; i++) {
    const lf = leafOf(x, i);
    const m = s.models.find(mm => mm.code === lf.model);
    if (lf.finish) anyFinish = true;
    const byVariant = !!m?.variants.some(v => /Категория \d/.test(v.label));
    const cat = lf.finish ? finishCategory(s, lf.finish) : null;
    if (!byVariant && cat != null && cat >= 2) {
      const it = categoryOption(idx, s, cat);
      if (it) catItems.get(it.id)!.cnt++;
    }
    const gc = insertCategory(idx, x, i);
    if (gc != null && gc >= 2) {
      const g = glass.find(it => it.name.includes(`Стекло ${gc}`));
      if (g) glassCnt.set(g.id, (glassCnt.get(g.id) ?? 0) + 1);
    }
  }
  if (anyFinish) {
    x.options = x.options.filter(l => !catItems.has(l.itemId));
    for (const { it, cnt } of catItems.values()) if (cnt > 0)
      x.options.push(it.kind === 'pct' ? { itemId: it.id, qty: 1, leavesOn: cnt } : { itemId: it.id, qty: cnt });
  }
  if (glass.length && Array.from({ length: n }, (_, i) => leafOf(x, i).insert).some(Boolean)) {
    x.options = x.options.filter(l => !glass.some(g => g.id === l.itemId));
    for (const [id, cnt] of glassCnt) x.options.push({ itemId: id, qty: cnt });
  }
}

/** Петель на весь проём: по высоте/ширине каждого полотна */
export function hingesNeeded(sys: { count: (h: number, w: number, extra: boolean) => number }, o: Opening, extra: boolean): { total: number; per: number[] } {
  const per = Array.from({ length: Math.max(1, o.leaves || 1) }, (_, i) => { const lf = leafOf(o, i); return sys.count(lf.height, lf.width, extra); });
  return { total: per.reduce((a, b) => a + b, 0), per };
}
