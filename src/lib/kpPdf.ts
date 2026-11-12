/**
 * КП → PDF прямо в приложении (на телефоне «Печать» из приложения не работает).
 * Страница КП рисуется в скрытом окне шириной A4, фото дверей с сайта фабрики
 * подгружаются через img-proxy (иначе браузер не даёт вшить чужие картинки в PDF).
 */
const SB = import.meta.env.VITE_SUPABASE_URL as string;
const A4_PX = 794; // ширина A4 при 96 dpi

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const src = /^https:\/\/(www\.)?profildoors\.ru\//.test(url) ? `${SB}/functions/v1/img-proxy?u=${encodeURIComponent(url)}` : url; // уже через прокси — как есть
    const r = await fetch(src);
    if (!r.ok) return null;
    const blob = await r.blob();
    // webp → png: jsPDF/html2canvas на старых iPhone не всегда рисуют webp
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    return c.toDataURL('image/png');
  } catch { return null; }
}

export async function kpToPdf(html: string, fileName: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_PX}px;height:1123px;border:0;visibility:hidden`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    doc.querySelectorAll('.noprint').forEach(e => (e as HTMLElement).style.display = 'none');
    const imgs = Array.from(doc.querySelectorAll('img'));
    await Promise.all(imgs.map(async img => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      const d = await toDataUrl(src);
      if (d) { img.removeAttribute('referrerpolicy'); img.src = d; await img.decode().catch(() => {}); }
      else img.style.visibility = 'hidden';
    }));
    await new Promise(r => setTimeout(r, 100));
    const body = doc.body;
    frame.style.height = `${body.scrollHeight + 20}px`;
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: '#ffffff', windowWidth: A4_PX, useCORS: true, logging: false });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 20;
    const w = pw - m * 2;
    const pxPerPt = canvas.width / w;
    const pageHpx = Math.floor((ph - m * 2) * pxPerPt);
    // режем по границам строк таблицы, чтобы дверь не разрезало пополам
    const scale = canvas.width / body.scrollWidth;
    const cuts = Array.from(doc.querySelectorAll('tr, .total, .foot, p')).map(e => Math.round((e as HTMLElement).getBoundingClientRect().top * scale)).filter(y => y > 0).sort((a, b) => a - b);
    let y = 0, first = true;
    while (y < canvas.height - 2) {
      let end = Math.min(y + pageHpx, canvas.height);
      if (end < canvas.height) { const c = cuts.filter(v => v > y + pageHpx * 0.5 && v <= end).pop(); if (c) end = c; }
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = end - y;
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
      if (!first) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, w, (end - y) / pxPerPt);
      first = false; y = end;
    }
    return new File([pdf.output('blob')], fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`, { type: 'application/pdf' });
  } finally {
    frame.remove();
  }
}
