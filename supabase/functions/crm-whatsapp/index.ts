// CRM A-Finance ↔ WhatsApp через Wazzup (ключ «Sidecar» из интеграции Wazzup с amoCRM).
//  • POST ?hook=<токен>        — вебхук Wazzup: входящие/исходящие сообщения и статусы.
//                                 Сообщение с нового номера создаёт лида в первом этапе воронки.
//  • {action:'send', lead_id, text} — отправить сообщение клиенту из карточки лида (вход по JWT).
//  • {action:'status'|'setup', channel_id?, manager_id?} — Главный админ: каналы Wazzup, подключение вебхука.
// Ключ Wazzup хранится в секрете функции WAZZUP_API_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const WZ = 'https://api.wazzup24.com/v3';
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const preview = (m: { text?: string | null; type?: string }) =>
  (m.text && m.text.trim()) || ({ image: '📷 Фото', audio: '🎤 Голосовое', video: '🎬 Видео', document: '📎 Файл', missing_call: '📞 Пропущенный звонок', geo: '📍 Геолокация', vcard: '👤 Контакт' } as Record<string, string>)[m.type ?? ''] || 'Сообщение';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } });
  const apiKey = Deno.env.get('WAZZUP_API_KEY') ?? '';
  const wz = (path: string, init: RequestInit = {}) => fetch(WZ + path, {
    ...init, signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

  try {
    // ───────────── вебхук Wazzup ─────────────
    if (url.searchParams.has('hook')) {
      const { data: tok } = await admin.from('cron_secret').select('value').eq('name', 'wazzup_hook').maybeSingle();
      if (!tok?.value || url.searchParams.get('hook') !== tok.value) return json({ error: 'forbidden' }, 403);
      let body: any = {};
      try { body = await req.json(); } catch { /* */ }
      if (body?.test) return json({ ok: true });
      const { data: settings } = await admin.from('crm_settings').select('*').eq('id', 1).maybeSingle();
      for (const m of body?.messages ?? []) {
        try { await handleMessage(admin, settings, m); } catch (e) { console.error('wazzup message', e); }
      }
      for (const st of body?.statuses ?? []) {
        if (st?.messageId) await admin.from('crm_messages').update({ status: st.status, error: st.error?.description ?? null }).eq('external_id', st.messageId);
      }
      return json({ ok: true });
    }

    // ───────────── вызовы с сайта ─────────────
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Войдите заново' }, 401);
    const { data: profile } = await admin.from('profiles').select('role, name, email, manager_id').eq('id', user.id).maybeSingle();
    const body = await req.json().catch(() => ({}));

    if (body.action === 'send') {
      if (!apiKey) return json({ error: 'WhatsApp ещё не подключён' }, 400);
      const text = String(body.text ?? '').trim();
      if (!text) return json({ error: 'Пустое сообщение' }, 400);
      // доступ к лиду проверяем правами самого пользователя
      const { data: lead } = await userClient.from('crm_leads').select('id, client_phone').eq('id', body.lead_id).maybeSingle();
      if (!lead) return json({ error: 'Нет доступа к лиду' }, 403);
      let chatId = digits(lead.client_phone);
      if (chatId.length === 10) chatId = '7' + chatId;
      if (chatId.length < 11) return json({ error: 'У лида нет номера телефона' }, 400);
      const { data: settings } = await admin.from('crm_settings').select('wa_channel_id').eq('id', 1).maybeSingle();
      if (!settings?.wa_channel_id) return json({ error: 'Не выбран номер WhatsApp — Главный админ подключает его в CRM' }, 400);
      const crmMessageId = crypto.randomUUID();
      const r = await wz('/message', { method: 'POST', body: JSON.stringify({ channelId: settings.wa_channel_id, chatType: 'whatsapp', chatId, text, crmMessageId }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: out?.description || out?.error || `Wazzup: ${r.status}` }, 400);
      const author = profile?.name && profile.name !== 'admin' ? profile.name : profile?.email ?? null;
      const { data: msg } = await admin.from('crm_messages').upsert({
        lead_id: lead.id, chat_id: chatId, channel_id: settings.wa_channel_id, direction: 'out', type: 'text', text,
        status: 'sent', external_id: out?.messageId ?? crmMessageId, author_name: author, author_id: user.id,
      }, { onConflict: 'external_id' }).select('*').single();
      await admin.from('crm_leads').update({ last_message_at: new Date().toISOString(), last_message_text: text.slice(0, 200), unread: 0 }).eq('id', lead.id);
      await closeReplyTask(admin, lead.id);
      return json({ ok: true, message: msg });
    }

    // настройки — только Главный админ
    if (profile?.role !== 'director') return json({ error: 'Только Главный админ' }, 403);
    if (!apiKey) return json({ connected: false, reason: 'no_key' });

    if (body.action === 'status' || body.action === 'setup') {
      const ch = await wz('/channels');
      const chList = ch.ok ? await ch.json().catch(() => []) : [];
      const channels = (Array.isArray(chList) ? chList : chList?.data ?? []).map((c: any) => ({
        id: c.channelId ?? c.channel_id, transport: c.transport, phone: c.plainId ?? c.phone ?? null, state: c.state ?? c.status ?? null,
      })).filter((c: any) => c.transport === 'whatsapp');
      const wh = await wz('/webhooks');
      const webhook = wh.ok ? await wh.json().catch(() => null) : null;
      if (body.action === 'status') return json({ connected: true, keyOk: ch.ok, channels, webhook: webhook?.webhooksUri ?? null });

      // setup: выбрать канал, кому отдавать новые лиды, включить вебхук
      const channel = channels.find((c: any) => c.id === body.channel_id) ?? channels[0];
      if (!channel) return json({ error: 'В Wazzup нет подключённого WhatsApp' }, 400);
      let { data: tok } = await admin.from('cron_secret').select('value').eq('name', 'wazzup_hook').maybeSingle();
      if (!tok?.value) {
        const value = crypto.randomUUID().replace(/-/g, '');
        await admin.from('cron_secret').insert({ name: 'wazzup_hook', value });
        tok = { value };
      }
      const hookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/crm-whatsapp?hook=${tok.value}`;
      const set = await wz('/webhooks', { method: 'PATCH', body: JSON.stringify({ webhooksUri: hookUrl, subscriptions: { messagesAndStatuses: true } }) });
      if (!set.ok) return json({ error: `Wazzup не принял вебхук: ${set.status} ${(await set.text()).slice(0, 200)}` }, 400);
      await admin.from('crm_settings').update({
        wa_channel_id: channel.id, wa_phone: channel.phone,
        ...(body.manager_id !== undefined ? { new_lead_manager_id: body.manager_id || null } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      return json({ ok: true, channel });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function handleMessage(admin: any, settings: any, m: any) {
  if (m?.chatType !== 'whatsapp') return;                 // Instagram/Telegram — следующие этапы
  const chatId = digits(m.chatId);
  if (chatId.length < 10) return;
  const p10 = chatId.slice(-10);
  const inbound = !m.isEcho && m.status === 'inbound';

  // уже есть такое сообщение (наше исходящее или повтор вебхука) — обновляем статус
  if (m.messageId) {
    const { data: ex } = await admin.from('crm_messages').select('id').eq('external_id', m.messageId).maybeSingle();
    if (ex) {
      await admin.from('crm_messages').update({ status: m.status, error: m.error?.description ?? null, ...(m.text ? { text: m.text } : {}) }).eq('id', ex.id);
      return;
    }
  }

  // лид клиента: последний по этому номеру; если его нет или он закрыт — новое обращение
  const { data: leads } = await admin.from('crm_leads').select('id, closed_at').eq('phone10', p10).order('created_at', { ascending: false }).limit(1);
  let lead = leads?.[0] ?? null;
  if ((!lead || lead.closed_at) && inbound && m.type !== 'unsupported') {
    lead = await createLead(admin, settings, chatId, m.contact?.name, !!lead);
  }
  if (!lead) return;

  const text = m.text ?? null;
  await admin.from('crm_messages').insert({
    lead_id: lead.id, chat_id: chatId, channel_id: m.channelId ?? null, direction: inbound ? 'in' : 'out',
    type: m.type ?? 'text', text, content_uri: m.contentUri ?? null, status: m.status ?? null,
    error: m.error?.description ?? null, external_id: m.messageId ?? null,
    author_name: m.isEcho ? (m.authorName ?? 'С телефона') : null, author_id: null,
    created_at: m.dateTime ? new Date(m.dateTime.endsWith('Z') ? m.dateTime : m.dateTime + 'Z').toISOString() : new Date().toISOString(),
  });
  if (!inbound) await closeReplyTask(admin, lead.id);
  const { data: cur } = await admin.from('crm_leads').select('unread').eq('id', lead.id).single();
  await admin.from('crm_leads').update({
    last_message_at: new Date().toISOString(), last_message_text: preview(m).slice(0, 200),
    unread: inbound ? (cur?.unread ?? 0) + 1 : 0,
  }).eq('id', lead.id);
}

async function createLead(admin: any, settings: any, chatId: string, name: string | undefined, repeat: boolean) {
  const { data: pipe } = await admin.from('crm_pipelines').select('id').order('sort').limit(1).maybeSingle();
  if (!pipe) return null;
  const { data: stage } = await admin.from('crm_stages').select('id').eq('pipeline_id', pipe.id).eq('kind', 'open').order('sort').limit(1).maybeSingle();
  // кому: из настроек CRM, иначе лидоруб
  let managerId = settings?.new_lead_manager_id ?? null;
  if (!managerId) {
    const { data: lid } = await admin.from('managers').select('id').eq('role', 'Лидоруб').eq('is_active', true).limit(1).maybeSingle();
    managerId = lid?.id ?? null;
  }
  const phone = '+' + (chatId.length === 10 ? '7' + chatId : chatId);
  const { data: lead } = await admin.from('crm_leads').insert({
    pipeline_id: pipe.id, stage_id: stage?.id, manager_id: managerId, client_name: (name || phone).slice(0, 120),
    client_phone: phone, source: 'WhatsApp', comment: repeat ? 'Повторное обращение' : null, created_by: null,
  }).select('id, closed_at').single();
  if (lead) {
    await admin.from('crm_tasks').insert({ lead_id: lead.id, manager_id: managerId, kind: 'message', title: 'Ответить клиенту в WhatsApp', due_at: new Date(Date.now() + 15 * 60000).toISOString(), created_by: null });
  }
  return lead;
}

// ответили клиенту — автоматическая задача «Ответить в WhatsApp» выполнена
async function closeReplyTask(admin: any, leadId: string) {
  await admin.from('crm_tasks').update({ done_at: new Date().toISOString(), result: 'Ответили в WhatsApp' })
    .eq('lead_id', leadId).eq('title', 'Ответить клиенту в WhatsApp').is('done_at', null);
}
