import { OPEN_KINDS } from '@/lib/sizeRules';
import { calcEstimate, CAT_LABEL, itemLabel, leafOf, money, modelPhotos, modelColorPhoto, modelDefaultPhoto, swatchFor, type ColorData, type EstimateData, type Opening, type PriceIndex } from '@/lib/price';
import { sideOf } from '@/lib/leaves';

/** Фото полотна i в его цвете */
function leafPhotoUrl(photos: Record<string, string>, colors: ColorData | null, o: Opening, i: number): string | undefined {
  const lf = leafOf(o, i);
  const p0 = modelPhotos(photos, o.sheet, lf.model, /дуб|орех|шпон|карамель|сонома|тобакко/i.test(`${lf.finish ?? ''} ${o.color}`));
  const base = (lf.photo && p0.find(p => p.url === lf.photo)) || p0[0];
  if (!base) return lf.photo;
  return (colors && (modelColorPhoto(colors, base.name, lf.finish, lf.insert) ?? modelDefaultPhoto(colors, base.name))) || base.url;
}

/** Образец цвета, если фото модели в этом цвете у фабрики нет (шпон и т. п.) */
function leafSwatch(photos: Record<string, string>, colors: ColorData | null, o: Opening, i: number): string | null {
  const lf = leafOf(o, i);
  if (!colors || !lf.finish) return null;
  const p0 = modelPhotos(photos, o.sheet, lf.model, true)[0];
  if (p0 && modelColorPhoto(colors, p0.name, lf.finish, lf.insert)) return null;
  return swatchFor(colors, o.sheet, lf.finish);
}
const doorImg = (photos: Record<string, string>, colors: ColorData | null, o: Opening, k: number, u: string) => {
  const sw = leafSwatch(photos, colors, o, k);
  return `<span class="dw"><img class="door" src="${esc(viaProxy(u))}" referrerpolicy="no-referrer"${sideOf(o, k) === 'L' ? ' style="transform:scaleX(-1)"' : ''}>${sw ? `<img class="sw" src="${esc(viaProxy(sw))}" referrerpolicy="no-referrer">` : ''}</span>`;
};

/** Фото с сайта фабрики — через наш img-proxy: в КП, PDF и пересланном файле они грузятся надёжно */
const SB = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const viaProxy = (u: string) => (SB && /^https:\/\/(www\.)?profildoors\.ru\/upload\//.test(u) ? `${SB}/functions/v1/img-proxy?u=${encodeURIComponent(u)}` : u);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface KpMeta { number?: number | null; clientName: string; clientPhone: string; managerName: string; date: string; priceTitle: string }

export type KpMode = 'client' | 'manager';

/**
 * КП по просчёту (HTML-страница).
 * client — для клиента: какая дверь, в каком цвете и сколько стоит комплект, без размеров, коробов и фурнитуры по позициям
 *          (чтобы по нашему КП не пересчитали в другом салоне);
 * manager — полный расчёт: размеры, опции, короба, фурнитура, суммы по категориям.
 */
export function buildKp(idx: PriceIndex, e: EstimateData, photos: Record<string, string>, colors: ColorData | null, meta: KpMeta, handlePhotos: Record<string, [string, Record<string, string>]> = {}, mode: KpMode = 'manager'): string {
  if (mode === 'client') return buildClientKp(idx, e, photos, colors, meta);
  const hp = (id: number) => { const u = handlePhotos[id]?.[0]; return u ? `<img class="part" src="${esc(viaProxy(u))}" referrerpolicy="no-referrer">` : ''; };
  const t = calcEstimate(idx, e);
  const rows: string[] = [];
  t.openings.forEach(({ o, b }, i) => {
    const vv = o.variantId != null ? idx.variant.get(o.variantId) : undefined;
    const lines: string[][] = [];
    if (vv) {
      const opts = [...b.fixedOptions.map(x => x.item.name + (x.qty > 1 ? ` ×${x.qty}` : '')), ...b.pctOptions.map(x => x.item.name)];
      const n = Math.max(1, b.leaves ?? 1);
      const imgs = Array.from({ length: n }, (_, k) => { const u = leafPhotoUrl(photos, colors, o, k); return u ? doorImg(photos, colors, o, k, u) : ''; }).join('');
      const sideTxt = (k: number) => { const sd = sideOf(o, k); return sd ? (sd === 'L' ? 'левая' : 'правая') : ''; };
      const leafTxt = Array.from({ length: n }, (_, k) => { const lf = leafOf(o, k); return (n > 1 || sideTxt(k)) ? `${n > 1 ? `Полотно ${k + 1}: ` : 'Сторона: '}${[lf.own && lf.model !== o.model ? lf.model : '', k > 0 && lf.finish !== o.finish ? lf.finish : '', k > 0 && lf.insert !== o.insert ? lf.insert : '', sideTxt(k), o.leafSet?.[k]?.b ? 'B-полотно' : ''].filter(Boolean).join(', ') || 'как полотно 1'}` : ''; }).filter(Boolean);
      const title = `${(b.leaves ?? 1) > 1 ? `<b>${b.leaves} полотна в проёме</b><br>` : ''}Полотно ${esc(vv.series.sheet)}, модель ${esc(o.photoName || vv.model.code)}${vv.v.label ? ` · ${esc(vv.v.label)}` : ''}`;
      lines.push([
        `<span class="doors">${imgs}</span>${title}${[o.openKind && o.openKind !== 'swing' && `Открывание: ${OPEN_KINDS.find(k => k.key === o.openKind)?.label ?? ''}`, o.finish && `Отделка: ${o.finish}`, o.insert && `Вставка: ${o.insert}`, o.profile && `Профиль: ${o.profile}`, o.color, ...leafTxt].filter(Boolean).map(t => `<br><small>${esc(t)}</small>`).join('')}${opts.length ? `<br><small>${esc(opts.join('; '))}</small>` : ''}`,
        `${o.height}×${o.width}`, 'шт', money(b.door), String(o.qty), money(b.door * o.qty),
      ]);
    }
    for (const x of b.extras) {
      lines.push([
        `${hp(x.item.id)}${esc(itemLabel(x.item))}${(() => { const c = o.extras.find(l => l.itemId === x.item.id && l.color)?.color; return c ? `<br><small>Цвет: ${esc(c)}</small>` : ''; })()}${x.mods.length ? `<br><small>${esc(x.mods.map(m => m.name).join('; '))}</small>` : ''}`,
        '', esc(x.item.unit || 'шт'), money(x.unit), String(+(x.qty * o.qty).toFixed(2)), money(x.sum * o.qty),
      ]);
    }
    lines.forEach((r, j) => rows.push(`<tr>${j === 0 ? `<td rowspan="${lines.length}" class="num">${i + 1}</td><td rowspan="${lines.length}">${esc(o.room) || '—'}</td>` : ''}${r.map((c, k) => `<td class="${k >= 3 ? 'r' : ''}">${c}</td>`).join('')}</tr>`));
    if (o.note) rows.push(`<tr><td></td><td colspan="7"><small>${esc(o.note)}</small></td></tr>`);
  });
  const itemRows = t.items.map((x, i) => `<tr><td class="num">${i + 1}</td><td>${hp(x.item!.id)}${esc(itemLabel(x.item!))}</td><td>${esc(x.item!.unit || 'шт')}</td><td class="r">${money(x.unit)}</td><td class="r">${x.l.qty}</td><td class="r">${money(x.sum)}</td></tr>`).join('');

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Расчёт${meta.number ? ` №${meta.number}` : ''} — ${esc(meta.clientName || 'клиент')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11px; margin: 0; padding: 16px; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1f2937; padding-bottom: 10px; }
  .logo { font-size: 28px; font-weight: 800; letter-spacing: 1px; }
  .contacts { text-align: right; font-size: 12px; line-height: 1.6; }
  h1 { text-align: center; font-size: 17px; margin: 14px 0 4px; }
  .meta { text-align: center; color: #6b7280; margin-bottom: 10px; }
  h2 { font-size: 12px; margin: 14px 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; font-weight: 600; }
  th, td { border: 1px solid #d1d5db; padding: 4px 6px; vertical-align: top; text-align: left; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  td.num { text-align: center; font-weight: 700; }
  small { color: #6b7280; }
  .doors { float: left; display: flex; gap: 2px; margin: 0 8px 2px 0; }
  .dw { position: relative; display: inline-block; } img.sw { position: absolute; right: 0; bottom: 2px; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; object-fit: cover; object-position: 50% 35%; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
  img.door { height: 110px; width: 46px; object-fit: contain; background: #fff; }
  img.part { float: left; width: 34px; height: 34px; object-fit: contain; margin: 0 6px 0 0; background: #fff; }
  tr { page-break-inside: avoid; }
  .total { margin-top: 12px; margin-left: auto; width: 320px; }
  .total td { border: none; padding: 3px 0; font-size: 13px; }
  .total tr.big td { font-size: 16px; font-weight: 800; border-top: 2px solid #1f2937; padding-top: 6px; }
  .foot { margin-top: 18px; color: #6b7280; font-size: 10px; }
  .internal { text-align: center; color: #b45309; font-size: 11px; margin: 0 0 8px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="head">
  <div class="logo">PROFILDOORS</div>
  <div class="contacts"><b>Межкомнатные двери</b><br>г. Шымкент, пр. Байдибек би, 392/1<br>+7 701 073 2022<br>profildoors.shymkent</div>
</div>
<h1>Расчёт для менеджера${meta.number ? ` № ${meta.number}` : ''}</h1>
<p class="internal">Внутренний документ: полный расчёт с размерами и комплектующими. Клиенту — «КП для клиента».</p>
<div class="meta">${esc(meta.date)}${meta.clientName ? ` · Клиент: ${esc(meta.clientName)}` : ''}${meta.clientPhone ? ` · ${esc(meta.clientPhone)}` : ''}${meta.managerName ? ` · Менеджер: ${esc(meta.managerName)}` : ''}</div>
${rows.length ? `<h2>Проёмы</h2><table><thead><tr><th>№</th><th>Помещение</th><th>Наименование</th><th>Размер, мм</th><th>Ед.</th><th class="r">Цена</th><th class="r">Кол-во</th><th class="r">Сумма</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : ''}
${itemRows ? `<h2>Дополнительно</h2><table><thead><tr><th>№</th><th>Наименование</th><th>Ед.</th><th class="r">Цена</th><th class="r">Кол-во</th><th class="r">Сумма</th></tr></thead><tbody>${itemRows}</tbody></table>` : ''}
<table class="total">
  ${(['door', 'box', 'sys', 'hinge', 'lock', 'handle', 'fitting', 'other'] as const).filter(c => (t.byCat[c] ?? 0) > 0).map(c => `<tr><td><small>${['hinge', 'lock', 'handle', 'fitting'].includes(c) ? 'Фурнитура: ' + CAT_LABEL[c].toLowerCase() : CAT_LABEL[c]}</small></td><td class="r"><small>${money(t.byCat[c] ?? 0)}</small></td></tr>`).join('')}
  <tr><td>Сумма</td><td class="r">${money(t.sub)}</td></tr>
  ${t.discount > 0 ? `<tr><td>Скидка ${e.discountPct}%${e.discountOn?.length ? ` <small>(${esc(e.discountOn.map(c => CAT_LABEL[c].toLowerCase()).join(', '))})</small>` : ''}</td><td class="r">−${money(t.discount)}</td></tr>` : ''}
  <tr class="big"><td>Итого</td><td class="r">${money(t.total)}</td></tr>
</table>
${e.comment ? `<p><b>Примечание:</b> ${esc(e.comment)}</p>` : ''}
<div class="foot">Цены по прайсу PROFILDOORS: ${esc(meta.priceTitle.replace(/\.\s*$/, ''))}. Предложение носит информационный характер; окончательная стоимость — после замера.</div>
</body></html>`;
  return html;
}

const HEAD = `<div class="head">
  <div class="logo">PROFILDOORS</div>
  <div class="contacts"><b>Межкомнатные двери</b><br>г. Шымкент, пр. Байдибек би, 392/1<br>+7 701 073 2022<br>profildoors.shymkent</div>
</div>`;

/** КП для клиента: дверь, цвет, фото и цена комплекта — без размеров и состава */
function buildClientKp(idx: PriceIndex, e: EstimateData, photos: Record<string, string>, colors: ColorData | null, meta: KpMeta): string {
  const t = calcEstimate(idx, e);
  const rows = t.openings.map(({ o, b }, i) => {
    const vv = o.variantId != null ? idx.variant.get(o.variantId) : undefined;
    const n = Math.max(1, b.leaves ?? 1);
    const imgs = vv ? Array.from({ length: n }, (_, k) => { const u = leafPhotoUrl(photos, colors, o, k); return u ? doorImg(photos, colors, o, k, u) : ''; }).join('') : '';
    const name = vv ? `Дверь ${esc(vv.series.sheet)} ${esc(o.photoName || vv.model.code)}${n > 1 ? ` · ${n} полотна` : ''}` : 'Комплектующие';
    const what = [o.finish && `Цвет: ${o.finish}`, o.insert && `Стекло: ${o.insert}`, o.profile && `Кромка: ${o.profile}`].filter(Boolean).map(x => `<br><small>${esc(x)}</small>`).join('');
    const has = [b.extras.some(x => /короб|наличник|добор|стойк|моноблок/i.test(x.item.name + x.item.sheet)) && 'короб и наличники', b.extras.some(x => /Петли|Замки|ручки|фурнитура/i.test(x.item.sheet)) && 'фурнитура'].filter(Boolean);
    const incl = has.length ? `<br><small>В комплекте: ${has.join(', ')}</small>` : '';
    const unit = o.qty > 0 ? b.total / o.qty : b.total;
    return `<tr><td class="num">${i + 1}</td><td class="pic">${imgs}</td><td><b>${name}</b>${o.room ? `<br>${esc(o.room)}` : ''}${what}${incl}</td><td class="r">${money(unit)}</td><td class="r">${o.qty}</td><td class="r"><b>${money(b.total)}</b></td></tr>`;
  });
  const items = t.items.map((x, i) => `<tr><td class="num">${t.openings.length + i + 1}</td><td></td><td>${esc(x.item!.name)}</td><td class="r">${money(x.unit)}</td><td class="r">${x.l.qty}</td><td class="r"><b>${money(x.sum)}</b></td></tr>`);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>КП${meta.number ? ` №${meta.number}` : ''} — ${esc(meta.clientName || 'клиент')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 12px; margin: 0; padding: 16px; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1f2937; padding-bottom: 10px; }
  .logo { font-size: 28px; font-weight: 800; letter-spacing: 1px; }
  .contacts { text-align: right; font-size: 12px; line-height: 1.6; }
  h1 { text-align: center; font-size: 18px; margin: 14px 0 4px; }
  .meta { text-align: center; color: #6b7280; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; font-weight: 600; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: middle; text-align: left; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  td.num { text-align: center; font-weight: 700; width: 28px; }
  td.pic { width: 1%; white-space: nowrap; }
  .dw { position: relative; display: inline-block; } img.sw { position: absolute; right: 0; bottom: 2px; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; object-fit: cover; object-position: 50% 35%; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
  img.door { height: 130px; width: 54px; object-fit: contain; background: #fff; margin-right: 2px; }
  small { color: #6b7280; }
  tr { page-break-inside: avoid; }
  .total { margin-top: 12px; margin-left: auto; width: 300px; }
  .total td { border: none; padding: 3px 0; font-size: 14px; }
  .total tr.big td { font-size: 18px; font-weight: 800; border-top: 2px solid #1f2937; padding-top: 6px; }
  .foot { margin-top: 18px; color: #6b7280; font-size: 10px; }
  @media (max-width: 560px) { body { padding: 10px; font-size: 11px; } .contacts { font-size: 10px; } img.door { height: 90px; width: 38px; } .total { width: 100%; } }
</style></head><body>
${HEAD}
<h1>Коммерческое предложение${meta.number ? ` № ${meta.number}` : ''}</h1>
<div class="meta">${esc(meta.date)}${meta.clientName ? ` · ${esc(meta.clientName)}` : ''}${meta.managerName ? ` · Менеджер: ${esc(meta.managerName)}` : ''}</div>
<table><thead><tr><th>№</th><th></th><th>Дверь</th><th class="r">Цена</th><th class="r">Кол-во</th><th class="r">Сумма</th></tr></thead><tbody>${[...rows, ...items].join('')}</tbody></table>
<table class="total">
  ${t.discount > 0 ? `<tr><td>Сумма</td><td class="r">${money(t.sub)}</td></tr><tr><td>Скидка</td><td class="r">−${money(t.discount)}</td></tr>` : ''}
  <tr class="big"><td>Итого</td><td class="r">${money(t.total)}</td></tr>
</table>
${e.comment ? `<p><b>Примечание:</b> ${esc(e.comment)}</p>` : ''}
<div class="foot">Цена двери указана за комплект. Подробный состав и размеры — у менеджера в салоне. Окончательная стоимость — после замера.</div>
</body></html>`;
}
