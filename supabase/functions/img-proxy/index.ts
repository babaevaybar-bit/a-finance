// Картинки с сайта фабрики для КП в PDF: браузер не даёт вшить в PDF фото с чужого сайта без CORS,
// поэтому отдаём их через себя. Только profildoors.ru и только изображения.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const ALLOWED = /^https:\/\/(www\.)?profildoors\.ru\/upload\//;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = new URL(req.url).searchParams.get('u') ?? '';
  if (!ALLOWED.test(u)) return new Response('forbidden', { status: 403, headers: cors });
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (A-Finance KP)', Accept: 'image/webp,image/*' }, signal: AbortSignal.timeout(15000) });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !type.startsWith('image/')) return new Response('not found', { status: 404, headers: cors });
    const body = await r.arrayBuffer();
    if (body.byteLength > 5_000_000) return new Response('too large', { status: 413, headers: cors });
    return new Response(body, { status: 200, headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' } });
  } catch {
    return new Response('error', { status: 502, headers: cors });
  }
});
