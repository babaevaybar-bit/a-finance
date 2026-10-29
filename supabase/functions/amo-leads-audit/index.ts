// Служебная проверка (только чтение): какие лиды amoCRM создались в рабочий день 20:00–20:00
// и почему каждый попал или не попал в «Новых лидов» ежедневного отчёта.
// Запуск только с ключом расписания (x-cron-key), ничего не пишет.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

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
  // статусы 142/143 («успешно»/«не реализовано») одинаковые во всех воронках — воронку берём из pipeline_id лида
  const st: Record<string, { name: string; pipe: string }> = {};
  const pipeName: Record<string, string> = {};
  for (const p of pipes?._embedded?.pipelines ?? []) {
    pipeName[String(p.id)] = p.name;
    for (const x of p._embedded?.statuses ?? []) st[x.id] = { name: x.name, pipe: p.name };
  }
  const um: Record<string, string> = { '0': 'Бот' };
  for (const u of users?._embedded?.users ?? []) um[u.id] = u.name;

  // Режим «bot»: что делает «Бот» (created_by = 0 — автоматические действия amoCRM) за последние N дней
  if (body?.mode === 'bot') {
    const now = Math.floor(Date.now() / 1000);
    const from = now - (Number(body.days) || 7) * 86400;
    const ev = await all(`/api/v4/events?filter[created_by][]=0&filter[created_at][from]=${from}&filter[created_at][to]=${now}`, 'events', 20);
    const byType: Record<string, { count: number; samples: any[] }> = {};
    for (const e of ev) {
      const t = byType[e.type] ??= { count: 0, samples: [] };
      t.count += 1;
      if (t.samples.length < 3) t.samples.push({ at: kz(e.created_at), entity: e.entity_type, id: e.entity_id,
        before: JSON.stringify(e.value_before ?? null).slice(0, 200), after: JSON.stringify(e.value_after ?? null).slice(0, 200) });
    }
    const leads = await all(`/api/v4/leads?with=source_id&filter[created_at][from]=${from}&filter[created_at][to]=${now}`, 'leads');
    const src: Record<string, number> = {};
    for (const l of leads) { const k = `${um[l.created_by] ?? l.created_by} · source ${l.source_id ?? '—'}`; src[k] = (src[k] ?? 0) + 1; }
    const sources = await get('/api/v4/sources');
    return new Response(JSON.stringify({ events: ev.length, byType, leadsBy: src,
      sources: (sources?._embedded?.sources ?? []).map((x: any) => ({ id: x.id, name: x.name, type: x.origin_code })) }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Режим «rights»: права пользователей amoCRM на сделки и контакты (только чтение)
  if (body?.mode === 'rights') {
    const u = await get('/api/v4/users?with=rights,role&limit=250');
    const rows = (u?._embedded?.users ?? []).map((x: any) => ({ name: x.name, admin: x.rights?.is_admin, active: x.rights?.is_active,
      leads: x.rights?.leads, contacts: x.rights?.contacts, companies: x.rights?.companies, role: x._embedded?.roles?.[0]?.name ?? null }));
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
  }

  // Режим «handoff»: лиды «Отдела продаж» за N дней — есть ли у них контакт с телефоном и чей он
  if (body?.mode === 'handoff') {
    const now = Math.floor(Date.now() / 1000);
    const from = now - (Number(body.days) || 14) * 86400;
    const salesId = Object.entries(pipeName).find(([, n]) => n === 'Отдел продаж')?.[0];
    const qualId = Object.entries(pipeName).find(([, n]) => n === 'Квалификация')?.[0];
    // лиды, которые меняли статус за период и сейчас в «Отделе продаж»
    const ev = await all(`/api/v4/events?filter[type][]=lead_status_changed&filter[created_at][from]=${from}&filter[created_at][to]=${now}`, 'events', 20);
    const moved = new Map<number, any>();
    for (const e of ev) {
      const b = e.value_before?.[0]?.lead_status, a2 = e.value_after?.[0]?.lead_status;
      if (String(b?.pipeline_id) === qualId && String(a2?.pipeline_id) === salesId) moved.set(e.entity_id, { at: kz(e.created_at), by: um[e.created_by] ?? e.created_by });
    }
    const created = await all(`/api/v4/leads?with=contacts&filter[pipeline_id][]=${salesId}&filter[created_at][from]=${from}&filter[created_at][to]=${now}`, 'leads');
    const ids = [...new Set([...moved.keys(), ...created.map((l: any) => l.id)])];
    const leads: any[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const q = ids.slice(i, i + 50).map(id => `filter[id][]=${id}`).join('&');
      const d = await get(`/api/v4/leads?with=contacts&limit=50&${q}`);
      leads.push(...(d?._embedded?.leads ?? []));
    }
    const cids = [...new Set(leads.flatMap((l: any) => (l._embedded?.contacts ?? []).map((c: any) => c.id)))];
    const contacts: Record<string, any> = {};
    for (let i = 0; i < cids.length; i += 50) {
      const q = cids.slice(i, i + 50).map(id => `filter[id][]=${id}`).join('&');
      const d = await get(`/api/v4/contacts?limit=50&${q}`);
      for (const c of d?._embedded?.contacts ?? []) contacts[c.id] = c;
    }
    const rows = leads.map((l: any) => {
      const cs = (l._embedded?.contacts ?? []).map((c: any) => contacts[c.id]).filter(Boolean);
      const phone = cs.some((c: any) => (c.custom_fields_values ?? []).some((f: any) => f.field_code === 'PHONE' && f.values?.length));
      return {
        id: l.id, name: l.name, created: kz(l.created_at), created_by: um[l.created_by] ?? l.created_by,
        pipe: pipeName[String(l.pipeline_id)], status: st[l.status_id]?.name, lead_resp: um[l.responsible_user_id] ?? l.responsible_user_id,
        moved: moved.get(l.id) ?? null, contacts: cs.length, phone,
        contact_resp: cs.map((c: any) => um[c.responsible_user_id] ?? c.responsible_user_id).join(','),
        phone_in_name: /\d{10,}/.test(String(l.name ?? '')),
      };
    }).sort((a: any, b: any) => a.created.localeCompare(b.created));
    return new Response(JSON.stringify({ salesId, qualId, moved: moved.size, rows }), { headers: { 'Content-Type': 'application/json' } });
  }

  const result: any[] = [];
  for (const date of dates) {
    const noonKz = Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000) - KZ;
    const from = Math.floor((noonKz + KZ + SHIFT) / 86400) * 86400 - KZ - SHIFT;
    const to = from + 86400;
    const now = Math.floor(Date.now() / 1000);
    const leads = await all(`/api/v4/leads?with=contacts&filter[created_at][from]=${from}&filter[created_at][to]=${Math.min(to, now) - 1}`, 'leads');
    const added = await all(`/api/v4/events?filter[type][]=lead_added&filter[created_at][from]=${from}&filter[created_at][to]=${Math.min(to, now)}`, 'events', 4);
    const deleted = await all(`/api/v4/events?filter[type][]=lead_deleted&filter[created_at][from]=${from}&filter[created_at][to]=${now}`, 'events', 4);
    const leadIds = new Set(leads.map((l: any) => l.id));
    const delIds = new Set(deleted.map((e: any) => e.entity_id));
    // повторное обращение: у контакта уже был лид раньше этого (id лидов растут по времени)
    const contactIds = [...new Set(leads.flatMap((l: any) => (l._embedded?.contacts ?? []).map((c: any) => c.id)))];
    const contactLeads: Record<string, number[]> = {};
    for (let i = 0; i < contactIds.length; i += 50) {
      const q = contactIds.slice(i, i + 50).map(id => `filter[id][]=${id}`).join('&');
      const d = await get(`/api/v4/contacts?with=leads&limit=50&${q}`);
      for (const c of d?._embedded?.contacts ?? []) contactLeads[c.id] = (c._embedded?.leads ?? []).map((x: any) => x.id);
    }
    // лид без контакта, но с номером в названии («Сделка 7701…») — ищем другие лиды и контакты с этим номером
    const phoneEarlier: Record<string, boolean> = {};
    for (const l of leads) {
      if ((l._embedded?.contacts ?? []).length) continue;
      const ph = String(l.name ?? '').replace(/\D/g, '').slice(-10);
      if (ph.length !== 10) continue;
      const [ls, cs] = await Promise.all([get(`/api/v4/leads?query=${ph}&limit=50`), get(`/api/v4/contacts?query=${ph}&with=leads&limit=50`)]);
      const ids = [
        ...(ls?._embedded?.leads ?? []).map((x: any) => x.id),
        ...(cs?._embedded?.contacts ?? []).flatMap((c: any) => (c._embedded?.leads ?? []).map((x: any) => x.id)),
      ];
      phoneEarlier[l.id] = ids.some((id: number) => id < l.id);
    }
    const isRepeat = (l: any) => !!phoneEarlier[l.id] ||
      (l._embedded?.contacts ?? []).some((c: any) => (contactLeads[c.id] ?? []).some(id => id < l.id));
    const rows = leads.map((l: any) => {
      const x = st[l.status_id];
      const pipe = pipeName[String(l.pipeline_id)] ?? x?.pipe ?? '?';
      let why = 'считается';
      if (!ALLOWED.includes(pipe)) why = `другая воронка: ${pipe}`;
      else if (l.status_id === 143) why = 'закрыт как «не реализовано»';
      else if (isRepeat(l)) why = 'повторное обращение';
      return { id: l.id, name: l.name, created: kz(l.created_at), pipe, status: x?.name ?? null,
        responsible: um[l.responsible_user_id] ?? l.responsible_user_id, created_by: um[l.created_by] ?? l.created_by, why,
        contacts: (l._embedded?.contacts ?? []).map((c: any) => `${c.id}:${(contactLeads[c.id] ?? []).length}`).join(','), repeat: isRepeat(l) };
    }).sort((a: any, b: any) => a.created.localeCompare(b.created));
    const missing = added.filter((e: any) => !leadIds.has(e.entity_id)).map((e: any) => ({
      id: e.entity_id, created: kz(e.created_at), by: um[e.created_by] ?? e.created_by, deleted: delIds.has(e.entity_id),
    }));
    // кто и когда закрыл лиды как «не реализовано» в этот рабочий день
    const closedEv = await all(`/api/v4/events?filter[type][]=lead_status_changed&filter[created_at][from]=${from}&filter[created_at][to]=${Math.min(to, now)}`, 'events', 8);
    const closed = closedEv.filter((e: any) => e.value_after?.[0]?.lead_status?.id === 143).map((e: any) => {
      const l = leads.find((x: any) => x.id === e.entity_id);
      return { id: e.entity_id, at: kz(e.created_at), by: um[e.created_by] ?? e.created_by,
        lead_created: l ? kz(l.created_at) : 'раньше этого дня', from: st[e.value_before?.[0]?.lead_status?.id]?.name ?? null };
    });
    result.push({ date, closed, from: kz(from), to: kz(to), counted: rows.filter((r: any) => r.why === 'считается').length, total: rows.length, rows, missing });
  }
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
});
