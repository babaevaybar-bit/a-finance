/**
 * Телефон → «ключи» (последние 10 цифр каждого номера) — так же, как public.phone_keys() в базе.
 * Понимает +7 777 111 10 18, 8 777 111 1018, 87771111018, 7771111018, 8(777)111-10-18, +7 77771111018,
 * «+7 777 966 9222 (номер дизайнера)», несколько номеров через запятую/пробел.
 */
function key1(d: string): string | null {
  if (d.length === 10 && /^[76]/.test(d)) return d;
  if (d.length === 11 && /^[78]/.test(d)) return d.slice(1);
  if (d.length === 12 && /^7[78]/.test(d)) return d.slice(2);
  if (d.length === 13 && /^(007|787|877)/.test(d)) return d.slice(3);
  return null;
}
export function phoneKeys(raw: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const m of String(raw ?? '').matchAll(/\+?\d[\d\s\-().]{6,40}\d/g)) {
    const d = m[0].replace(/\D/g, '');
    const k = key1(d);
    if (k) { out.add(k); continue; }
    if (d.length >= 20 && d.length <= 26) {
      for (const i of [10, 11]) {
        const a = key1(d.slice(0, i)), b = key1(d.slice(i));
        if (a && b) { out.add(a); out.add(b); break; }
      }
    }
  }
  return [...out].sort();
}
/** Похоже ли на номер телефона (для поиска) */
export const looksLikePhone = (q: string) => phoneKeys(q).length > 0;
/** +7 777 111 10 18 */
export function fmtPhoneKey(k: string) {
  return k.length === 10 ? `+7 ${k.slice(0, 3)} ${k.slice(3, 6)} ${k.slice(6, 8)} ${k.slice(8)}` : k;
}
