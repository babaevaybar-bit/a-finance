import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KZ_OFFSET_SEC = 5 * 60 * 60;
// Рабочий день: с 20:00 до 20:00 следующего дня (лиды, звонки, чаты, переходы)
const LEAD_SHIFT_SEC = 4 * 60 * 60;
const ALLOWED_PIPELINE_NAMES = ['Отдел продаж', 'Квалификация'];

// Green-API: общий адрес api.green-api.com перестал отвечать — используем адрес своего инстанса
function gaBase(ga: any): string {
  return (ga?.api_url || `https://${String(ga?.id_instance ?? '').slice(0, 4)}.api.green-api.com`).replace(/\/$/, '');
}

function kzDateLabel(unixSeconds: number): string {
  return new Date((unixSeconds + KZ_OFFSET_SEC) * 1000).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}
function kzShortLabel(unixSeconds: number): string {
  const d = new Date((unixSeconds + KZ_OFFSET_SEC) * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${mi}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: ga } = await supabaseAdmin
      .from('green_api_settings')
      .select('id_instance, api_token_instance, group_chat_id, api_url')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ga || !ga.group_chat_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'GREEN-API ещё не подключен' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await supabaseAdmin
      .from('amocrm_settings')
      .select('subdomain, access_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!settings) {
      return new Response(JSON.stringify({ skipped: true, reason: 'amoCRM не подключен' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base = `https://${settings.subdomain}.amocrm.ru`;
    const authHeaders = { Authorization: `Bearer ${settings.access_token}` };

    async function amoGet(path: string) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`${base}${path}`, { headers: authHeaders, signal: AbortSignal.timeout(20000) });
          if (!res.ok) return null;
          const text = await res.text();
          if (!text) return null;
          try { return JSON.parse(text); } catch { return null; }
        } catch (e) {
          if (attempt === 3) return null;
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
      return null;
    }

    async function amoGetAllPages(pathWithoutPage: string, maxPages = 10, embedKey = '') {
      const items: any[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const sep = pathWithoutPage.includes('?') ? '&' : '?';
        const data = await amoGet(`${pathWithoutPage}${sep}page=${page}&limit=250`);
        const chunk = embedKey ? (data?._embedded?.[embedKey] ?? []) : [];
        if (!chunk.length) break;
        items.push(...chunk);
        if (chunk.length < 250) break;
      }
      return items;
    }

    const now = Math.floor(Date.now() / 1000);
    // Окно: вчера 20:00 → сегодня 20:00. Берём рабочий день, в который попадает момент за 2 часа до запуска,
    // чтобы отчёт в 20:00 (и с небольшой задержкой) считал именно завершившийся рабочий день.
    const leadRef = now - 2 * 60 * 60;
    const leadDayStart = Math.floor((leadRef + KZ_OFFSET_SEC + LEAD_SHIFT_SEC) / 86400) * 86400 - KZ_OFFSET_SEC - LEAD_SHIFT_SEC;
    const leadDayEnd = leadDayStart + 86400;

    const [pipelinesData, usersData, allLeadsUnfiltered, callEvents, chatEvents, statusEvents] = await Promise.all([
      amoGet('/api/v4/leads/pipelines'),
      amoGet('/api/v4/users?limit=250'),
      amoGetAllPages('/api/v4/leads?order[id]=desc', 20, 'leads'),
      amoGetAllPages(`/api/v4/events?filter[type][]=incoming_call&filter[type][]=outgoing_call&filter[created_at][from]=${leadDayStart}&filter[created_at][to]=${now}`, 4, 'events'),
      amoGetAllPages(`/api/v4/events?filter[type][]=outgoing_chat_message&filter[created_at][from]=${leadDayStart}&filter[created_at][to]=${now}`, 4, 'events'),
      amoGetAllPages(`/api/v4/events?filter[type][]=lead_status_changed&filter[created_at][from]=${leadDayStart}&filter[created_at][to]=${now}`, 4, 'events'),
    ]);

    const statusMap: Record<string, { name: string; pipeline_id: string; sort: number }> = {};
    const allowedPipelineIds = new Set<string>();
    let salesPipelineId: string | null = null;
    for (const pipeline of pipelinesData?._embedded?.pipelines ?? []) {
      if (ALLOWED_PIPELINE_NAMES.includes(pipeline.name)) allowedPipelineIds.add(String(pipeline.id));
      if (pipeline.name === 'Отдел продаж') salesPipelineId = String(pipeline.id);
      for (const status of pipeline._embedded?.statuses ?? []) {
        statusMap[status.id] = { name: status.name, pipeline_id: String(pipeline.id), sort: status.sort };
      }
    }
    function leadAllowed(statusId: number | string): boolean {
      const pid = statusMap[statusId]?.pipeline_id;
      return pid ? allowedPipelineIds.has(pid) : false;
    }

    const userMap: Record<string, string> = { '0': 'Бот' };
    for (const u of usersData?._embedded?.users ?? []) userMap[u.id] = u.name;

    const inWindow = (t: number) => t >= leadDayStart && t < leadDayEnd;

    const leadsToday = allLeadsUnfiltered.filter((l: any) =>
      leadAllowed(l.status_id) &&
      inWindow(l.created_at) &&
      statusMap[l.status_id]?.name !== 'Закрыто и не реализовано'
    );
    const leadsTodaySum = leadsToday.reduce((s: number, l: any) => s + Number(l.price || 0), 0);

    let callsIn = 0, callsOut = 0;
    const byUser: Record<string, { leads: number; callsIn: number; callsOut: number; chats: number }> = {};
    function ensure(id: string | number) {
      const k = String(id);
      if (!byUser[k]) byUser[k] = { leads: 0, callsIn: 0, callsOut: 0, chats: 0 };
      return byUser[k];
    }

    for (const l of leadsToday) ensure(l.responsible_user_id).leads += 1;
    for (const ev of callEvents) {
      if (!inWindow(ev.created_at)) continue;
      if (ev.type === 'incoming_call') { callsIn += 1; ensure(ev.created_by).callsIn += 1; }
      else { callsOut += 1; ensure(ev.created_by).callsOut += 1; }
    }
    let chatsTotal = 0;
    for (const ev of chatEvents) {
      if (!inWindow(ev.created_at)) continue;
      chatsTotal += 1;
      ensure(ev.created_by).chats += 1;
    }

    let transitionsToday = 0;
    let wonTodayCount = 0;
    let wonTodaySum = 0;
    const leadById = new Map(allLeadsUnfiltered.map((l: any) => [l.id, l]));
    for (const ev of statusEvents) {
      if (!inWindow(ev.created_at)) continue;
      const toId = ev.value_after?.[0]?.lead_status?.id;
      if (!toId || !leadAllowed(toId)) continue;
      transitionsToday += 1;
      if (statusMap[toId]?.name === 'Успешно реализовано') {
        wonTodayCount += 1;
        const lead = leadById.get(ev.entity_id) as any;
        wonTodaySum += Number(lead?.price || 0);
      }
    }

    const funnelCounts: Record<string, number> = {};
    for (const l of allLeadsUnfiltered) {
      const st = statusMap[l.status_id];
      if (st?.pipeline_id === salesPipelineId && st.sort >= 30 && st.sort <= 100) {
        funnelCounts[st.name] = (funnelCounts[st.name] ?? 0) + 1;
      }
    }
    const funnelOrder = Object.entries(statusMap)
      .filter(([, st]) => st.pipeline_id === salesPipelineId && st.sort >= 30 && st.sort <= 100)
      .sort((a, b) => a[1].sort - b[1].sort)
      .map(([, st]) => st.name);
    const funnelUnique = [...new Set(funnelOrder)];

    const { data: coreManagers } = await supabaseAdmin
      .from('managers')
      .select('name, amocrm_user_id')
      .not('amocrm_user_id', 'is', null)
      .eq('is_active', true);

    const lines: string[] = [];
    lines.push(`*Ежедневный отчёт — ${kzDateLabel(now)}*`);
    lines.push(`_период: с ${kzShortLabel(leadDayStart)} до ${kzShortLabel(leadDayEnd)}_`);
    lines.push('');
    lines.push(`Новых лидов: *${leadsToday.length}* (на сумму ${leadsTodaySum.toLocaleString('ru-RU')} ₸)`);
    lines.push(`Звонков: *${callsIn + callsOut}* (вход ${callsIn} / исход ${callsOut})`);
    lines.push(`Чатов обработано: *${chatsTotal}*`);
    lines.push(`Переходов по этапам: *${transitionsToday}*`);
    lines.push(`Успешно реализовано: *${wonTodayCount}* сделок на ${wonTodaySum.toLocaleString('ru-RU')} ₸`);
    lines.push('');
    lines.push('*По сотрудникам:*');
    for (const m of coreManagers ?? []) {
      const s = byUser[String(m.amocrm_user_id)] ?? { leads: 0, callsIn: 0, callsOut: 0, chats: 0 };
      lines.push(`${m.name}: лидов ${s.leads}, звонков ${s.callsIn + s.callsOut}, чатов ${s.chats}`);
    }
    lines.push('');
    lines.push('*Воронка (Отдел продаж):*');
    for (const stageName of funnelUnique) {
      lines.push(`${stageName}: ${funnelCounts[stageName] ?? 0}`);
    }

    const text = lines.join('\n');

    // До 3 попыток отправки, каждая не дольше 20 секунд
    let sendStatus = 0;
    let sendResultText = '';
    for (let attempt = 1; attempt <= 3 && !(sendStatus >= 200 && sendStatus < 300); attempt++) {
      try {
        const sendRes = await fetch(`${gaBase(ga)}/waInstance${ga.id_instance}/sendMessage/${ga.api_token_instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: ga.group_chat_id, message: text }),
          signal: AbortSignal.timeout(20000),
        });
        sendStatus = sendRes.status;
        sendResultText = await sendRes.text();
      } catch (e) {
        sendResultText = String(e);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return new Response(JSON.stringify({
      sent: sendStatus >= 200 && sendStatus < 300,
      greenApiStatus: sendStatus,
      greenApiResponse: sendResultText,
      reportText: text,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
