import { leafUnits, openingFrame, doorUnit, transomUnit, totals, type EstimateData } from '@/lib/estimate/model';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`;

export interface KpMeta {
  managerName: string; managerPhone: string;
  clientName: string; clientPhone: string; clientAddress: string;
  date: string;
}

/** Коммерческое предложение — как лист «КП» в таблице просчёта. Открывается в новом окне для печати / PDF. */
export function openKp(e: EstimateData, meta: KpMeta, photoFor?: (o: EstimateData['openings'][number]) => string | undefined, nameFor?: (o: EstimateData['openings'][number]) => string | undefined) {
  const t = totals(e);
  const colors = new Set<string>(); const covers = new Set<string>();
  const doorRows: string[] = [];
  e.openings.forEach((o, i) => {
    const rows: string[][] = [];
    const d = doorUnit(o.door);
    if (o.door && d && 'series' in d) {
      const isV = o.door.options.includes('v');
      const opts = d.series.options.filter(x => o.door!.options.includes(x.id) && x.id !== 'v').map(x => x.label);
      if (o.door.color) colors.add(o.door.color);
      covers.add(d.series.name + (o.door.perl && d.series.perl ? ' (Перламутр/Элегант)' : ''));
      const ph = photoFor?.(o) ?? o.door.photo;
      const sizes = leafUnits(o);
      const lv = sizes.length;
      const topH = Math.max(...sizes.map(x => x.h || 1));
      const pics = ph ? `<span class="pics">${sizes.map((x, k) => `<img class="door${k >= lv / 2 && lv > 1 ? ' flip' : ''}" src="${esc(ph)}" referrerpolicy="no-referrer" style="height:${Math.round(80 * x.h / topH)}px;width:${Math.round(80 * x.w / topH)}px">`).join('')}</span>` : '';
      // одинаковые по размеру полотна — одной строкой
      const groups = new Map<string, { h: number; w: number; unit: number; n: number }>();
      for (const x of sizes) {
        if (!x.calc || !x.calc.ok || !x.calc.unit) continue;
        const key = `${x.h}×${x.w}`;
        const g = groups.get(key) ?? { h: x.h, w: x.w, unit: x.calc.unit, n: 0 };
        g.n++; groups.set(key, g);
      }
      [...groups.values()].forEach((g, gi) => {
        rows.push([isV ? 'В-Полотно' : 'Полотно',
          gi === 0 ? `${pics}${lv > 1 ? `<b>${lv} полотна в проёме</b><br>` : ''}${esc(o.door!.modelName || nameFor?.(o) || d.model.model)}${d.model.fill ? `<br><small>${esc(d.model.fill)}</small>` : ''}${o.door!.edgeColor ? `<br><small>Кромка: ${esc(o.door!.edgeColor)}</small>` : ''}${opts.length ? `<br><small>${esc(opts.join(', '))}</small>` : ''}` : `<small>то же, другой размер</small>`,
          `${g.h}×${g.w}${o.door!.thickness ? `×${esc(o.door!.thickness)}` : ''}`, esc(o.openType), 'шт', money(g.unit), String(o.qty * g.n), money(g.unit * o.qty * g.n)]);
      });
    }
    const tr = transomUnit(o);
    if (tr && o.transom) rows.push(['Фрамуга-дверь', esc(tr.label), `${o.transom.area} м²`, '', 'м²', money(tr.perm2), String(Math.round(o.transom.area * o.qty * 100) / 100), money(tr.sum * o.qty)]);
    for (const l of openingFrame(o)) {
      if (!l.item || l.qty <= 0) continue;
      const kind = l.label.startsWith('Наличник') ? 'Наличник' : l.label.startsWith('Добор') || l.label === 'Расширитель' ? 'Добор' : 'Короб';
      rows.push([kind, esc(l.item.name), esc(l.item.spec ?? ''), '', esc(l.item.unit), money(l.item.price), String(Math.round(l.qty * o.qty * 100) / 100), money(l.item.price * l.qty * o.qty)]);
    }
    for (const l of o.lines) rows.push([esc(l.kind), esc(l.name), esc(l.spec ?? ''), '', esc(l.unit), money(l.price), String(Math.round(l.qty * o.qty * 100) / 100), money(l.price * l.qty * o.qty)]);
    rows.forEach((r, j) => {
      doorRows.push(`<tr>${j === 0 ? `<td rowspan="${rows.length}" class="num">${i + 1}</td>` : ''}${r.map((c, k) => `<td class="${k >= 5 ? 'r' : ''}">${c}</td>`).join('')}${j === 0 ? `<td rowspan="${rows.length}">${esc(o.room)}</td>` : ''}</tr>`);
    });
  });
  const hwRows = e.hardware.map((l, i) => `<tr><td class="num">${i + 1}</td><td>${esc(l.kind === 'Ручки' ? 'Ручка' : l.kind)}</td><td>${esc(l.name)}</td><td>${esc(l.spec ?? '')}</td><td></td><td>${esc(l.unit)}</td><td class="r">${money(l.price)}</td><td class="r">${l.qty}</td><td class="r">${money(l.price * l.qty)}</td><td>${esc(l.maker ?? '')}</td></tr>`).join('');

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>КП — ${esc(meta.clientName || 'клиент')}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11px; margin: 0; padding: 16px; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #f08a4b; padding-bottom: 10px; }
  .logo { font-size: 30px; font-weight: 800; letter-spacing: 1px; color: #1f2937; line-height: 1; }
  .logo span { display: block; color: #f08a4b; font-size: 16px; letter-spacing: 6px; text-align: right; }
  .contacts { text-align: right; font-size: 12px; line-height: 1.6; }
  .contacts b { font-size: 14px; }
  h1 { text-align: center; font-size: 18px; margin: 14px 0 10px; }
  h2 { background: #f08a4b; color: #fff; font-size: 12px; padding: 5px 8px; margin: 12px 0 0; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #fde7d9; font-weight: 600; }
  th, td { border: 1px solid #d1d5db; padding: 4px 6px; vertical-align: top; text-align: left; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  td.num { text-align: center; font-weight: 700; }
  small { color: #6b7280; }
  .pics { float: left; display: flex; margin: 0 8px 0 0; border: 2px solid #a8a29e; }
  img.door { height: 80px; display: block; object-fit: fill; }
  .pics { align-items: flex-end; }
  img.door.flip { transform: scaleX(-1); }
  .sum { display: flex; justify-content: space-between; gap: 16px; margin-top: 6px; }
  .info td { border: none; padding: 2px 6px; }
  .total { font-size: 13px; font-weight: 700; }
  .grand { margin-top: 12px; text-align: right; font-size: 16px; font-weight: 800; }
  .people { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 18px; font-size: 12px; }
  .people div { line-height: 1.9; }
  .sign { margin-top: 18px; border-top: 1px solid #9ca3af; width: 220px; padding-top: 2px; color: #6b7280; font-size: 10px; }
  @media print { .noprint { display: none; } body { padding: 0; } }
  .noprint { position: fixed; bottom: 14px; right: 14px; }
  .noprint button { padding: 8px 14px; font-size: 13px; border-radius: 8px; border: 1px solid #ccc; background: #f08a4b; color: #fff; cursor: pointer; }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Печать / сохранить в PDF</button></div>
<div class="head">
  <div class="logo">PROFILDOORS<span>ORANGE</span></div>
  <div class="contacts"><b>Межкомнатные двери</b><br>г. Шымкент, пр. Байдибек би, 392/1<br>+7 701 073 2022<br>profildoors.shymkent</div>
</div>
<h1>Коммерческое предложение</h1>
<h2>Двери и комплектующие</h2>
<table><thead><tr><th style="width:28px">№</th><th>Наименование</th><th>Модель</th><th>Размер В×Ш (мм)</th><th>Открывание</th><th>Ед. изм.</th><th class="r">Цена за ед.</th><th class="r">Кол-во</th><th class="r">Стоимость</th><th>Помещение</th></tr></thead>
<tbody>${doorRows.join('') || '<tr><td colspan="10">—</td></tr>'}</tbody></table>
<div class="sum"><table class="info" style="width:auto"><tr><td><b>Цвет полотен:</b></td><td>${esc([...colors].join(', ') || '—')}</td></tr><tr><td><b>Покрытие:</b></td><td>${esc([...covers].join(', ') || '—')}</td></tr><tr><td><b>Производство:</b></td><td>PROFILDOORS ORANGE, Россия</td></tr></table>
<div class="total">Итоговая сумма: ${money(t.doors)}</div></div>
${e.hardware.length ? `<h2>Фурнитура</h2>
<table><thead><tr><th style="width:28px">№</th><th>Наименование</th><th>Модель</th><th>Характеристики</th><th>Примечание</th><th>Ед. изм.</th><th class="r">Цена за ед.</th><th class="r">Кол-во</th><th class="r">Стоимость</th><th>Производитель</th></tr></thead>
<tbody>${hwRows}</tbody></table>
<div class="sum"><span></span><div class="total">Итоговая сумма: ${money(t.hardware)}</div></div>` : ''}
${t.discount ? `<div class="grand" style="font-size:13px;font-weight:600">Скидка ${e.discountPct}%: −${money(t.discount)}</div>` : ''}
<div class="grand">Общая сумма: ${money(t.total)}</div>
${e.note ? `<p style="margin-top:8px"><b>Примечание:</b> ${esc(e.note)}</p>` : ''}
<div class="people">
  <div>Имя менеджера: <b>${esc(meta.managerName)}</b><br>Номер телефона: ${esc(meta.managerPhone)}<br>Число: ${esc(meta.date)}<div class="sign">Подпись</div></div>
  <div>Имя клиента: <b>${esc(meta.clientName)}</b><br>Номер телефона: ${esc(meta.clientPhone)}<br>Адрес: ${esc(meta.clientAddress)}<div class="sign">Подпись</div></div>
</div>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
