import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_PIPELINE_NAMES = ['Отдел продаж', 'Квалификация'];

const KZ_OFFSET_SEC = 5 * 60 * 60;
// Рабочий день: с 20:00 до 20:00 следующего дня (всё после 20:00 идёт на следующий день) — лиды, звонки, чаты, переходы
const LEAD_SHIFT_SEC = 4 * 60 * 60;

function dayKey(unixSeconds: number): string {
  return new Date((unixSeconds + KZ_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}
function leadDayKey(unixSeconds: number): string {
  return dayKey(unixSeconds + LEAD_SHIFT_SEC);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role, manager_id')
      .eq('id', user.id)
      .single();

    // amoCRM (полный доступ) открыт и менеджерам по продажам
    if (!['director', 'director_view', 'rop', 'technolog', 'manager', 'lidorub'].includes(profile?.role ?? '')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // «Доступ» → amoCRM: менеджер без «Все» видит только сделки, звонки и чаты своего пользователя amoCRM
    let ownAmoId: string | null = null;
    let ownOnly = false;
    if (['manager', 'lidorub'].includes(profile?.role ?? '')) {
      const { data: perm } = await supabaseAdmin.from('employee_permissions')
        .select('scope_all, can_view').eq('manager_id', profile?.manager_id ?? '').eq('page', 'amocrm').maybeSingle();
      if (!(perm?.scope_all && perm?.can_view)) {
        ownOnly = true;
        const { data: me } = await supabaseAdmin.from('managers').select('amocrm_user_id').eq('id', profile?.manager_id ?? '').maybeSingle();
        ownAmoId = me?.amocrm_user_id ? String(me.amocrm_user_id) : null;
      }
    }
    const mine = (uid: unknown) => !ownOnly || (ownAmoId !== null && String(uid) === ownAmoId);

    const { data: settings, error: settingsErr } = await supabaseAdmin
      .from('amocrm_settings')
      .select('subdomain, access_token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (settingsErr || !settings) {
      return new Response(JSON.stringify({ error: 'amoCRM не подключен' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base = `https://${settings.subdomain}.amocrm.ru`;
    const authHeaders = { Authorization: `Bearer ${settings.access_token}` };

    async function amoGet(path: string) {
      const res = await fetch(`${base}${path}`, { headers: authHeaders });
      if (!res.ok) return null;
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }

    async function amoGetAllPages(pathWithoutPage: string, maxPages = 2, embedKey = '') {
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

    const url = new URL(req.url);
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '250';

    const now = Math.floor(Date.now() / 1000);
    const from30 = now - 31 * 24 * 60 * 60;
    // Начало текущего рабочего дня — последнее 20:00
    const leadDayStart = Math.floor((now + KZ_OFFSET_SEC + LEAD_SHIFT_SEC) / 86400) * 86400 - KZ_OFFSET_SEC - LEAD_SHIFT_SEC;

    let [
      leadsData,
      pipelinesData,
      usersData,
      allLeadsUnfiltered,
      callEvents,
      statusEvents,
      chatEvents,
    ] = await Promise.all([
      amoGet(`/api/v4/leads?with=contacts&page=${page}&limit=${limit}&order[created_at]=desc`),
      amoGet(`/api/v4/leads/pipelines`),
      amoGet(`/api/v4/users?limit=250`),
      amoGetAllPages(`/api/v4/leads?order[id]=desc`, 20, 'leads'),
      amoGetAllPages(`/api/v4/events?filter[type][]=incoming_call&filter[type][]=outgoing_call&filter[created_at][from]=${from30}&filter[created_at][to]=${now}`, 8, 'events'),
      amoGetAllPages(`/api/v4/events?filter[type][]=lead_status_changed&filter[created_at][from]=${from30}&filter[created_at][to]=${now}&with=lead_name`, 8, 'events'),
      amoGetAllPages(`/api/v4/events?filter[type][]=outgoing_chat_message&filter[type][]=incoming_chat_message&filter[created_at][from]=${from30}&filter[created_at][to]=${now}`, 2, 'events'),
    ]);

    if (ownOnly) {
      allLeadsUnfiltered = allLeadsUnfiltered.filter((l: any) => mine(l.responsible_user_id));
      const ownLeadIds = new Set(allLeadsUnfiltered.map((l: any) => l.id));
      callEvents = callEvents.filter((ev: any) => mine(ev.created_by));
      chatEvents = chatEvents.filter((ev: any) => mine(ev.created_by));
      statusEvents = statusEvents.filter((ev: any) => ownLeadIds.has(ev.entity_id));
      if (leadsData?._embedded?.leads) leadsData._embedded.leads = leadsData._embedded.leads.filter((l: any) => mine(l.responsible_user_id));
    }

    const statusMap: Record<string, { name: string; pipeline_id: string; pipeline_name: string; color: string; sort: number }> = {};
    const allowedPipelineIds = new Set<string>();
    let salesPipelineId: string | null = null;
    for (const pipeline of pipelinesData?._embedded?.pipelines ?? []) {
      if (ALLOWED_PIPELINE_NAMES.includes(pipeline.name)) {
        allowedPipelineIds.add(String(pipeline.id));
      }
      if (pipeline.name === 'Отдел продаж') salesPipelineId = String(pipeline.id);
      for (const status of pipeline._embedded?.statuses ?? []) {
        statusMap[status.id] = {
          name: status.name,
          pipeline_id: String(pipeline.id),
          pipeline_name: pipeline.name,
          color: status.color,
          sort: status.sort,
        };
      }
    }
    const filterByPipeline = allowedPipelineIds.size > 0;
    function leadAllowed(statusId: number | string): boolean {
      if (!filterByPipeline) return true;
      const pid = statusMap[statusId]?.pipeline_id;
      return pid ? allowedPipelineIds.has(pid) : false;
    }

    const userMap: Record<string, string> = { '0': 'Бот / автоматически' };
    for (const u of usersData?._embedded?.users ?? []) {
      userMap[u.id] = u.name;
    }

    const leadsRaw = leadsData?._embedded?.leads ?? [];
    const result = leadsRaw
      .filter((lead: any) => leadAllowed(lead.status_id))
      .map((lead: any) => ({
        id: lead.id,
        name: lead.name,
        price: lead.price,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
        closed_at: lead.closed_at,
        status_id: lead.status_id,
        status_name: statusMap[lead.status_id]?.name ?? null,
        pipeline_name: statusMap[lead.status_id]?.pipeline_name ?? null,
        status_color: statusMap[lead.status_id]?.color ?? null,
        responsible_user_id: lead.responsible_user_id,
        responsible_user_name: userMap[lead.responsible_user_id] ?? null,
        is_lost: statusMap[lead.status_id]?.name === 'Закрыто и не реализовано',
      }));

    // статус 143 («не реализовано») общий для всех воронок — воронку берём из pipeline_id сделки
    const allLeadsFiltered = allLeadsUnfiltered.filter((l: any) => filterByPipeline ? allowedPipelineIds.has(String(l.pipeline_id)) : true);

    const SALES_STAGE_SORT_MIN = 30;
    const SALES_STAGE_SORT_MAX = 100;
    const salesStageLeadsRaw = allLeadsUnfiltered.filter((l: any) => {
      const st = statusMap[l.status_id];
      return st?.pipeline_id === salesPipelineId && st.sort >= SALES_STAGE_SORT_MIN && st.sort <= SALES_STAGE_SORT_MAX;
    });
    const salesStageLeads = salesStageLeadsRaw
      .map((lead: any) => ({
        id: lead.id,
        name: lead.name,
        price: lead.price,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
        status_id: lead.status_id,
        status_name: statusMap[lead.status_id]?.name ?? null,
        status_color: statusMap[lead.status_id]?.color ?? null,
        responsible_user_id: lead.responsible_user_id,
        responsible_user_name: userMap[lead.responsible_user_id] ?? null,
        closest_task_at: lead.closest_task_at ?? null,
      }))
      .sort((a, b) => b.created_at - a.created_at);
    const salesStageSum = salesStageLeads.reduce((s, l) => s + Number(l.price || 0), 0);
    // все поступившие лиды, в том числе позже закрытые как нецелевые — как в ежедневном отчёте
    const leadsInRangeFiltered = allLeadsFiltered.filter((l: any) => l.created_at >= from30);

    // Лиды по дням — день считается с 20:00 до 20:00
    const leadsByDayMap: Record<string, number> = {};
    for (const lead of leadsInRangeFiltered) {
      const k = leadDayKey(lead.created_at);
      leadsByDayMap[k] = (leadsByDayMap[k] ?? 0) + 1;
    }

    const callsByDayMap: Record<string, { incoming: number; outgoing: number }> = {};
    let callsToday = 0, callsInToday = 0, callsOutToday = 0;
    for (const ev of callEvents) {
      const k = leadDayKey(ev.created_at);
      if (!callsByDayMap[k]) callsByDayMap[k] = { incoming: 0, outgoing: 0 };
      if (ev.type === 'incoming_call') callsByDayMap[k].incoming += 1;
      else callsByDayMap[k].outgoing += 1;
      if (ev.created_at >= leadDayStart) {
        callsToday += 1;
        if (ev.type === 'incoming_call') callsInToday += 1; else callsOutToday += 1;
      }
    }

    const leadDays: string[] = [];
    for (let i = 29; i >= 0; i--) {
      leadDays.push(leadDayKey(leadDayStart - i * 24 * 60 * 60));
    }
    // прошедшие дни — ровно как в сохранённых ежедневных отчётах (без повторных обращений), сегодня — живой счёт
    if (!ownOnly) {
      const { data: reps } = await supabaseAdmin.from('amo_daily_reports').select('report_date, leads').gte('report_date', leadDays[0]);
      for (const r of reps ?? []) if (r.report_date !== leadDays[leadDays.length - 1] && r.leads != null) leadsByDayMap[r.report_date] = Number(r.leads);
    }
    const leadsByDay = leadDays.map(d => ({ date: d, count: leadsByDayMap[d] ?? 0 }));
    const callsByDay = leadDays.map(d => ({
      date: d,
      incoming: callsByDayMap[d]?.incoming ?? 0,
      outgoing: callsByDayMap[d]?.outgoing ?? 0,
      total: (callsByDayMap[d]?.incoming ?? 0) + (callsByDayMap[d]?.outgoing ?? 0),
    }));

    const funnelMap: Record<string, number> = {};
    for (const lead of allLeadsFiltered) {
      funnelMap[lead.status_id] = (funnelMap[lead.status_id] ?? 0) + 1;
    }
    const funnel = Object.entries(funnelMap)
      .map(([statusId, count]) => ({
        status_id: statusId,
        status_name: statusMap[statusId]?.name ?? `Статус ${statusId}`,
        pipeline_name: statusMap[statusId]?.pipeline_name ?? '',
        color: statusMap[statusId]?.color ?? '#94a3b8',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const allowedTransitions = statusEvents
      .filter((ev: any) => {
        const toId = ev.value_after?.[0]?.lead_status?.id;
        return toId ? leadAllowed(toId) : false;
      })
      .sort((a: any, b: any) => b.created_at - a.created_at);
    const statusChangesToday = allowedTransitions.filter((ev: any) => ev.created_at >= leadDayStart).length;
    const recentTransitions = allowedTransitions
      .slice(0, 30)
      .map((ev: any) => {
        const fromId = ev.value_before?.[0]?.lead_status?.id;
        const toId = ev.value_after?.[0]?.lead_status?.id;
        const leadName = ev._embedded?.lead_name?.name ?? ev._embedded?.lead?.name ?? null;
        return {
          lead_id: ev.entity_id,
          lead_name: leadName ?? result.find((l: any) => l.id === ev.entity_id)?.name ?? `Сделка #${ev.entity_id}`,
          from_status: fromId ? (statusMap[fromId]?.name ?? null) : null,
          to_status: toId ? (statusMap[toId]?.name ?? null) : null,
          changed_at: ev.created_at,
          manager_name: userMap[ev.created_by] ?? null,
        };
      });

    const newLeadsToday = leadsInRangeFiltered.filter((l: any) => l.created_at >= leadDayStart).length;

    const byUser: Record<string, { newLeads: number; callsIn: number; callsOut: number; chats: number }> = {};
    function ensureUser(id: string | number) {
      const key = String(id);
      if (!byUser[key]) byUser[key] = { newLeads: 0, callsIn: 0, callsOut: 0, chats: 0 };
      return byUser[key];
    }

    for (const lead of leadsInRangeFiltered) {
      if (lead.created_at >= leadDayStart) {
        ensureUser(lead.responsible_user_id).newLeads += 1;
      }
    }
    for (const ev of callEvents) {
      if (ev.created_at < leadDayStart) continue;
      const u = ensureUser(ev.created_by);
      if (ev.type === 'incoming_call') u.callsIn += 1; else u.callsOut += 1;
    }
    for (const ev of chatEvents) {
      if (ev.created_at < leadDayStart) continue;
      if (ev.type !== 'outgoing_chat_message') continue;
      ensureUser(ev.created_by).chats += 1;
    }

    let dailyByUser = Object.entries(byUser)
      .map(([userId, stats]) => ({
        user_id: userId,
        user_name: userMap[userId] ?? `Пользователь ${userId}`,
        newLeads: stats.newLeads,
        callsIn: stats.callsIn,
        callsOut: stats.callsOut,
        callsTotal: stats.callsIn + stats.callsOut,
        chats: stats.chats,
      }))
      .filter(u => u.newLeads > 0 || u.callsTotal > 0 || u.chats > 0)
      .sort((a, b) => (b.callsTotal + b.chats + b.newLeads) - (a.callsTotal + a.chats + a.newLeads));

    const { data: coreManagers } = await supabaseAdmin
      .from('managers')
      .select('name, amocrm_user_id')
      .not('amocrm_user_id', 'is', null)
      .eq('is_active', true);

    const coreIds = new Set((coreManagers ?? []).map((m: any) => String(m.amocrm_user_id)));
    const coreOrder = (coreManagers ?? []).map((m: any) => String(m.amocrm_user_id));
    const dailyByUserIds = new Set(dailyByUser.map(u => u.user_id));
    for (const [uid, uname] of Object.entries(userMap)) {
      if (!coreIds.has(uid) || dailyByUserIds.has(uid)) continue;
      const s = byUser[uid];
      dailyByUser.push({
        user_id: uid,
        user_name: uname,
        newLeads: s?.newLeads ?? 0,
        callsIn: s?.callsIn ?? 0,
        callsOut: s?.callsOut ?? 0,
        callsTotal: (s?.callsIn ?? 0) + (s?.callsOut ?? 0),
        chats: s?.chats ?? 0,
      });
    }
    dailyByUser.sort((a, b) => {
      const ai = coreOrder.indexOf(a.user_id);
      const bi = coreOrder.indexOf(b.user_id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return (b.callsTotal + b.chats + b.newLeads) - (a.callsTotal + a.chats + a.newLeads);
    });

    if (ownOnly) dailyByUser = dailyByUser.filter(u => mine(u.user_id));

    return new Response(JSON.stringify({
      leads: result,
      page: Number(page),
      hasMore: leadsRaw.length === Number(limit),
      todayStats: {
        newLeads: newLeadsToday,
        leadsFrom: leadDayStart,
        calls: callsToday,
        callsIn: callsInToday,
        callsOut: callsOutToday,
        statusChanges: statusChangesToday,
      },
      leadsByDay,
      callsByDay,
      funnel,
      recentTransitions,
      dailyByUser,
      salesStageLeads,
      salesStageSum,
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
