import { OPEN_KINDS } from '@/lib/sizeRules';
import { calcEstimate, itemLabel, money, modelPhotos, type EstimateData, type PriceIndex } from '@/lib/price';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface KpMeta { number?: number | null; clientName: string; clientPhone: string; managerName: string; date: string; priceTitle: string }

/** Коммерческое предложение по просчёту — открывается в новом окне, оттуда печать или «Сохранить как PDF». */
export function openKp(idx: PriceIndex, e: EstimateData, photos: Record<string, string>, meta: KpMeta) {
  const t = calcEstimate(idx, e);
  const rows: string[] = [];
  t.openings.forEach(({ o, b }, i) => {
    const vv = o.variantId != null ? idx.variant.get(o.variantId) : undefined;
    const lines: string[][] = [];
    if (vv) {
      const opts = [...b.fixedOptions.map(x => x.item.name + (x.qty > 1 ? ` ×${x.qty}` : '')), ...b.pctOptions.map(x => x.item.name)];
      const ph = o.photo ?? modelPhotos(photos, o.sheet, o.model, /дуб|орех|шпон/i.test(o.color))[0]?.url;
      const title = `Полотно ${esc(vv.series.sheet)}, модель ${esc(o.photoName || vv.model.code)}${vv.v.label ? ` · ${esc(vv.v.label)}` : ''}`;
      lines.push([
        `${ph ? `<img class="door" src="${esc(ph)}" referrerpolicy="no-referrer">` : ''}${title}${[o.openKind && o.openKind !== 'swing' && `Открывание: ${OPEN_KINDS.find(k => k.key === o.openKind)?.label ?? ''}`, o.finish && `Отделка: ${o.finish}`, o.insert && `Вставка: ${o.insert}`, o.profile && `Профиль: ${o.profile}`, o.color].filter(Boolean).map(t => `<br><small>${esc(t)}</small>`).join('')}${opts.length ? `<br><small>${esc(opts.join('; '))}</small>` : ''}`,
        `${o.height}×${o.width}`, 'шт', money(b.door), String(o.qty), money(b.door * o.qty),
      ]);
    }
    for (const x of b.extras) {
      lines.push([
        `${esc(itemLabel(x.item))}${x.mods.length ? `<br><small>${esc(x.mods.map(m => m.name).join('; '))}</small>` : ''}`,
        '', esc(x.item.unit || 'шт'), money(x.unit), String(+(x.qty * o.qty).toFixed(2)), money(x.sum * o.qty),
      ]);
    }
    lines.forEach((r, j) => rows.push(`<tr>${j === 0 ? `<td rowspan="${lines.length}" class="num">${i + 1}</td><td rowspan="${lines.length}">${esc(o.room) || '—'}</td>` : ''}${r.map((c, k) => `<td class="${k >= 3 ? 'r' : ''}">${c}</td>`).join('')}</tr>`));
    if (o.note) rows.push(`<tr><td></td><td colspan="7"><small>${esc(o.note)}</small></td></tr>`);
  });
  const itemRows = t.items.map((x, i) => `<tr><td class="num">${i + 1}</td><td>${esc(itemLabel(x.item!))}</td><td>${esc(x.item!.unit || 'шт')}</td><td class="r">${money(x.unit)}</td><td class="r">${x.l.qty}</td><td class="r">${money(x.sum)}</td></tr>`).join('');

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>КП${meta.number ? ` №${meta.number}` : ''} — ${esc(meta.clientName || 'клиент')}</title>
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
  img.door { float: left; height: 90px; width: 38px; object-fit: contain; margin: 0 8px 2px 0; background: #fff; }
  tr { page-break-inside: avoid; }
  .total { margin-top: 12px; margin-left: auto; width: 320px; }
  .total td { border: none; padding: 3px 0; font-size: 13px; }
  .total tr.big td { font-size: 16px; font-weight: 800; border-top: 2px solid #1f2937; padding-top: 6px; }
  .foot { margin-top: 18px; color: #6b7280; font-size: 10px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="head">
  <div class="logo">PROFILDOORS</div>
  <div class="contacts"><b>Межкомнатные двери</b><br>г. Шымкент, пр. Байдибек би, 392/1<br>+7 701 073 2022<br>profildoors.shymkent</div>
</div>
<h1>Коммерческое предложение${meta.number ? ` № ${meta.number}` : ''}</h1>
<div class="meta">${esc(meta.date)}${meta.clientName ? ` · Клиент: ${esc(meta.clientName)}` : ''}${meta.clientPhone ? ` · ${esc(meta.clientPhone)}` : ''}${meta.managerName ? ` · Менеджер: ${esc(meta.managerName)}` : ''}</div>
${rows.length ? `<h2>Проёмы</h2><table><thead><tr><th>№</th><th>Помещение</th><th>Наименование</th><th>Размер, мм</th><th>Ед.</th><th class="r">Цена</th><th class="r">Кол-во</th><th class="r">Сумма</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : ''}
${itemRows ? `<h2>Дополнительно</h2><table><thead><tr><th>№</th><th>Наименование</th><th>Ед.</th><th class="r">Цена</th><th class="r">Кол-во</th><th class="r">Сумма</th></tr></thead><tbody>${itemRows}</tbody></table>` : ''}
<table class="total">
  <tr><td>Сумма</td><td class="r">${money(t.sub)}</td></tr>
  ${t.discount > 0 ? `<tr><td>Скидка ${e.discountPct}%</td><td class="r">−${money(t.discount)}</td></tr>` : ''}
  <tr class="big"><td>Итого</td><td class="r">${money(t.total)}</td></tr>
</table>
${e.comment ? `<p><b>Примечание:</b> ${esc(e.comment)}</p>` : ''}
<div class="foot">Цены по прайсу PROFILDOORS: ${esc(meta.priceTitle.replace(/\.\s*$/, ''))}. Предложение носит информационный характер; окончательная стоимость — после замера.</div>
<p class="noprint" style="text-align:center;margin-top:16px"><button onclick="window.print()" style="padding:8px 18px;font-size:13px">Печать / PDF</button></p>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
