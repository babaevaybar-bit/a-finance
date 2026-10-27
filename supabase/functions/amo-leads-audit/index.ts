// Служебная проверка (только чтение): какие лиды amoCRM создались в рабочий день 20:00–20:00
// и почему каждый попал или не попал в «Новых лидов» ежедневного отчёта.
// Запуск только с ключом расписания (x-cron-key), ничего не пишет.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const KZ = 5 * 3600;
const SHIFT = 4 * 3600;
const ALLOWED = ['Отдел продаж', 'Квалификация'];
const kz = (t: number) => new Date((t + KZ) * 1000).toISOString().slice(0, 16).replace('T', ' ');

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: key } = await admin.from('cron_secret').select('value').eq('name', 'cron_key').maybeSingle();
  if (!key?.value || req.headers.get('x-cron-key') !== key.value) return new Response('forbidden', { status: 403 });

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const dates: string[] = Array.isArray(body?.dates) ? body.dates : [];

  const { data: s } = await admin.from('amocrm_settings').select('subdomain, access_token').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!s) return new Response(JSON.stringify({ error: 'no amo' }), { status: 400 });
  const base = `https://${s.subdomain}.amocrm.ru`;
  const get = async (p: string) => {
    const r = await fetch(base + p, { headers: { Authorization: `Bearer ${s.access_token}` } });
    if (!r.ok) return null; const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  const all = async (p: string, key: string, max = 10) => {
    const out: any[] = [];
    for (let i = 1; i <= max; i++) {
      const d = await get(`${p}${p.includes('?') ? '&' : '?'}page=${i}&limit=250`);
      const c = d?._embedded?.[key] ?? []; out.push(...c); if (c.length < 250) break;
    }
    return out;
  };

  const pipes = await get('/api/v4/leads/pipelines');
  const users = await get('/api/v4/users?limit=250');
  const st: Record<string, { name: string; pipe: string }> = {};
  for (const p of pipes?._embedded?.pipelines ?? []) for (const x of p._embedded?.statuses ?? []) st[x.id] = { name: x.name, pipe: p.name };
  const um: Record<string, string> = { '0': 'Бот' };
  for (const u of users?._embedded?.users ?? []) um[u.id] = u.name;

  const result: any[] = [];
  for (const date of dates) {
    const noonKz = Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000) - KZ;
    const from = Math.floor((noonKz + KZ + SHIFT) / 86400) * 86400 - KZ - SHIFT;
    const to = from + 86400;
    const now = Math.floor(Date.now() / 1000);
    const leads = await all(`/api/v4/leads?filter[created_at][from]=${from}&filter[created_at][to]=${Math.min(to, now) - 1}`, 'leads');
    const added = await all(`/api/v4/events?filter[type][]=lead_added&filter[created_at][from]=${from}&filter[created_at][to]=${Math.min(to, now)}`, 'events', 4);
    const deleted = await all(`/api/v4/events?filter[type][]=lead_deleted&filter[created_at][from]=${from}&filter[created_at][to]=${now}`, 'events', 4);
    const leadIds = new Set(leads.map((l: any) => l.id));
    const delIds = new Set(deleted.map((e: any) => e.entity_id));
    const rows = leads.map((l: any) => {
      const x = st[l.status_id];
      let why = 'считается';
      if (!x || !ALLOWED.includes(x.pipe)) why = `другая воронка: ${x?.pipe ?? '?'}`;
      else if (x.name === 'Закрыто и не реализовано') why = 'закрыт как «не реализовано»';
      return { id: l.id, name: l.name, created: kz(l.created_at), pipe: x?.pipe ?? null, status: x?.name ?? null,
        responsible: um[l.responsible_user_id] ?? l.responsible_user_id, created_by: um[l.created_by] ?? l.created_by, why };
    }).sort((a: any, b: any) => a.created.localeCompare(b.created));
    const missing = added.filter((e: any) => !leadIds.has(e.entity_id)).map((e: any) => ({
      id: e.entity_id, created: kz(e.created_at), by: um[e.created_by] ?? e.created_by, deleted: delIds.has(e.entity_id),
    }));
    result.push({ date, from: kz(from), to: kz(to), counted: rows.filter((r: any) => r.why === 'считается').length, total: rows.length, rows, missing });
  }
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});
