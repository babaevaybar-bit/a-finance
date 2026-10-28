// Когда лидоруб передаёт сделку менеджеру, контакт клиента (с телефоном) остаётся за лидорубом,
// а менеджер с правом «контакты: только свои» его не видит. Эта функция переводит такой контакт
// на ответственного по сделке. Трогает только контакты, которые сейчас за лидорубом (или ни за кем),
// и только у открытых сделок «Отдела продаж», ответственный по которым — менеджер по продажам.
// Запуск: расписание (x-cron-key). body.mode = 'dry' — только показать, что будет изменено.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SALES_PIPELINE = 'Отдел продаж';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: key } = await admin.from('cron_secret').select('value').eq('name', 'cron_key').maybeSingle();
    if (!key?.value || req.headers.get('x-cron-key') !== key.value) return json({ error: 'forbidden' }, 403);

    let body: any = {};
    try { body = await req.json(); } catch { /* */ }
    const dry = body?.mode === 'dry';
    const days = Math.min(Number(body?.days) || 3, 120);

    const { data: s } = await admin.from('amocrm_settings').select('subdomain, access_token').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!s) return json({ skipped: 'amoCRM не подключен' });
    const base = `https://${s.subdomain}.amocrm.ru`;
    const headers = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' };
    const get = async (p: string) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const r = await fetch(base + p, { headers, signal: AbortSignal.timeout(20000) });
          if (!r.ok) return null; const t = await r.text(); return t ? JSON.parse(t) : null;
        } catch { await new Promise(res => setTimeout(res, 700 * attempt)); }
      }
      return null;
    };

    // кто лидоруб и кто менеджеры — из «Сотрудников» A-Finance
    const { data: mgrs } = await admin.from('managers').select('name, role, amocrm_user_id, is_active').not('amocrm_user_id', 'is', null);
    const lidorub = new Set((mgrs ?? []).filter((m: any) => m.role === 'Лидоруб').map((m: any) => String(m.amocrm_user_id)));
    lidorub.add('0');
    const sales = new Map((mgrs ?? []).filter((m: any) => m.role === 'Менеджер по продажам' && m.is_active)
      .map((m: any) => [String(m.amocrm_user_id), m.name]));

    const pipes = await get('/api/v4/leads/pipelines');
    const salesId = String((pipes?._embedded?.pipelines ?? []).find((p: any) => p.name === SALES_PIPELINE)?.id ?? '');
    if (!salesId) return json({ error: 'нет воронки «Отдел продаж»' }, 400);

    const now = Math.floor(Date.now() / 1000);
    const leads: any[] = [];
    // самые свежие изменения сверху; останавливаемся, когда дошли до сделок старше `days` дней
    const since = now - days * 86400;
    for (let page = 1; page <= 20; page++) {
      const d = await get(`/api/v4/leads?with=contacts&order[updated_at]=desc&page=${page}&limit=250`);
      const chunk = d?._embedded?.leads ?? [];
      leads.push(...chunk.filter((l: any) => l.updated_at >= since));
      if (chunk.length < 250 || chunk.some((l: any) => l.updated_at < since)) break;
    }
    const open = leads.filter((l: any) => String(l.pipeline_id) === salesId && l.status_id !== 142 && l.status_id !== 143
      && sales.has(String(l.responsible_user_id)));

    const cids = [...new Set(open.flatMap((l: any) => (l._embedded?.contacts ?? []).map((c: any) => c.id)))];
    const contacts: Record<string, any> = {};
    for (let i = 0; i < cids.length; i += 25) {
      const q = cids.slice(i, i + 25).map(id => `filter[id][]=${id}`).join('&');
      const d = await get(`/api/v4/contacts?limit=25&${q}`);
      for (const c of d?._embedded?.contacts ?? []) contacts[c.id] = c;
    }

    const changes = new Map<number, { contact: number; name: string; lead: number; lead_name: string; to: number; to_name: string }>();
    for (const l of open) {
      for (const ref of l._embedded?.contacts ?? []) {
        const c = contacts[ref.id];
        if (!c || !lidorub.has(String(c.responsible_user_id)) || changes.has(c.id)) continue;
        changes.set(c.id, { contact: c.id, name: c.name, lead: l.id, lead_name: l.name, to: l.responsible_user_id, to_name: sales.get(String(l.responsible_user_id)) ?? '' });
      }
    }
    const list = [...changes.values()];
    const inSales = leads.filter((l: any) => String(l.pipeline_id) === salesId);
    const stats = { fetched: leads.length, in_sales: inSales.length,
      open_in_sales: inSales.filter((l: any) => l.status_id !== 142 && l.status_id !== 143).length,
      resp: [...new Set(inSales.map((l: any) => String(l.responsible_user_id)))] };
    if (dry || !list.length) return json({ dry, checked: open.length, stats, changes: list });

    let done = 0; const errors: string[] = [];
    for (let i = 0; i < list.length; i += 50) {
      const part = list.slice(i, i + 50);
      const r = await fetch(`${base}/api/v4/contacts`, {
        method: 'PATCH', headers, signal: AbortSignal.timeout(20000),
        body: JSON.stringify(part.map(x => ({ id: x.contact, responsible_user_id: x.to }))),
      });
      if (r.ok) done += part.length; else errors.push(`${r.status} ${(await r.text()).slice(0, 200)}`);
    }
    return json({ checked: open.length, changed: done, changes: list, errors });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
