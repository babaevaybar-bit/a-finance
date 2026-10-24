import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KZ_OFFSET_SEC = 5 * 60 * 60;
const TRELLO_BOARD_ID = '69ac06dcb59ad75791c3385b';

function kzDateString(unixSeconds: number): string {
  return new Date((unixSeconds + KZ_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}

const MONTH_STAGE_TO_NUM: Record<string, string> = {
  'Явнварь': '01', 'Январь': '01',
  'Февраль': '02',
  'Март': '03',
  'Апрель': '04',
  'Май': '05',
  'Июнь': '06',
  'Июль': '07',
  'Август': '08',
  'Сентябрь': '09',
  'Октябрь': '10',
  'Ноябрь': '11',
  'Декабрь': '12',
};

const CF = {
  PREPAYMENT: 1392229,
  REMAINDER: 1392225,
  DOOR_TYPE: 1392233,
  CONTRACT_NUM: 1398113,      // «Договор» (текст) — текущее поле в amoCRM
  CONTRACT_NUM_OLD: 1392237,  // старое поле, на случай старых сделок
  CONTRACT_DATE: 1392239,
  ADDRESS: 1392251,
};

function getCF(lead: any, fieldId: number): any {
  const field = (lead.custom_fields_values ?? []).find((f: any) => f.field_id === fieldId);
  return field?.values?.[0]?.value ?? null;
}

function getContractNum(lead: any): string | null {
  const v = getCF(lead, CF.CONTRACT_NUM) ?? getCF(lead, CF.CONTRACT_NUM_OLD);
  return v != null && String(v).trim() ? String(v).trim() : null;
}

// Способ оплаты из amoCRM — если в сделке есть поле вроде «Способ оплаты» / «Оплата» / «Банк»
function amoPaymentChannel(lead: any): string | null {
  const field = (lead.custom_fields_values ?? []).find((f: any) => /способ\s*оплат|оплата|банк/i.test(String(f.field_name ?? '')) && !/предоплат/i.test(String(f.field_name ?? '')));
  const raw = String(field?.values?.[0]?.value ?? '').toLowerCase();
  if (!raw) return null;
  if (/kaspi|каспи/.test(raw)) return 'Kaspi Bank';
  if (/halyk|халык|народ/.test(raw)) return 'Halyk Bank';
  if (/freedom|фридом/.test(raw)) return 'Freedom Bank';
  if (/rbk|рбк/.test(raw)) return 'RBK Bank';
  if (/нал(?!ог)|cash/.test(raw) && !/безнал/.test(raw)) return 'Наличные';
  if (/перечисл|безнал|на\s*сч[её]т/.test(raw)) return 'Перечисление';
  return null;
}
const CHANNELS = ['Kaspi Bank', 'Halyk Bank', 'Freedom Bank', 'RBK Bank', 'Наличные', 'Перечисление'];

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₸';

// ── Trello: дозаполнение телефона и адреса из названия карточки ──
// Формат карточки: «код - клиент - адрес - телефон - товар - сумма - менеджер»
function lastSegmentNum(s: string): string | null {
  const parts = s.split(/[.\-\s]+/).filter(Boolean);
  const n = parseInt(parts[parts.length - 1], 10);
  return Number.isFinite(n) ? String(n) : null;
}
function cardCode(name: string): string | null {
  const m = name.match(/^\s*([\d.\-]+)/);
  return m ? m[1] : null;
}
function normPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && (d.startsWith('8') || d.startsWith('7'))) d = '7' + d.slice(1);
  else if (d.length === 10) d = '7' + d;
  else return null;
  return '+' + d;
}
const ADDRESS_HINT = /(^|\s)(г\.?|город|ЖК|ул\.?|улица|проезд|мкр|микрорайон|пр\.?|проспект|район|с\.|село|пос)(\s|\.|,|$)/i;

function parseTrelloCard(name: string): { phone: string | null; address: string | null } {
  const parts = name.split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
  let phone: string | null = null;
  let address: string | null = null;
  for (const p of parts.slice(1)) {
    const digits = p.replace(/\D/g, '');
    if (!phone && /^[+\d\s()\-]+$/.test(p) && digits.length >= 10 && digits.length <= 11) {
      phone = normPhone(p);
      continue;
    }
    if (!address && ADDRESS_HINT.test(p) && digits.length < 10) address = p.replace(/[.\s]+$/, '');
  }
  return { phone, address };
}
function nameTokens(s: string | null): string[] {
  return (s ?? '').toLowerCase().split(/[^a-zа-яёәіңғүұқөһ0-9]+/i).filter(t => t.length >= 3);
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

    async function leadPhone(lead: any): Promise<string | null> {
      const contactRef = (lead._embedded?.contacts ?? []).find((c: any) => c.is_main) ?? lead._embedded?.contacts?.[0];
      if (!contactRef?.id) return null;
      const contact = await amoGet(`/api/v4/contacts/${contactRef.id}`);
      if (!contact) return null;
      const phoneField = (contact.custom_fields_values ?? []).find((f: any) => f.field_code === 'PHONE');
      return phoneField?.values?.[0]?.value ?? null;
    }

    // Карточки Trello загружаются один раз и только если они нужны (только чтение)
    let trelloCards: { name: string }[] | null = null;
    async function getTrelloCards() {
      if (trelloCards) return trelloCards;
      trelloCards = [];
      const { data: ts } = await supabaseAdmin.from('trello_settings').select('api_key, token')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (!ts) return trelloCards;
      try {
        const res = await fetch(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/cards?fields=name&key=${ts.api_key}&token=${ts.token}`);
        if (res.ok) trelloCards = await res.json();
      } catch { /* ignore */ }
      return trelloCards!;
    }
    // Карточка должна совпасть и по номеру договора, и по имени клиента — чтобы не взять чужую
    async function trelloInfo(contract: string | null, clientName: string | null) {
      if (!contract) return null;
      const num = lastSegmentNum(contract);
      if (!num) return null;
      const tokens = nameTokens(clientName);
      if (!tokens.length) return null;
      const cards = await getTrelloCards();
      const found = cards.filter(c => {
        const code = cardCode(c.name);
        if (!code || lastSegmentNum(code) !== num) return false;
        const low = c.name.toLowerCase();
        return tokens.some(t => low.includes(t));
      });
      if (found.length !== 1) return null;
      return parseTrelloCard(found[0].name);
    }

    const pipelinesData = await amoGet('/api/v4/leads/pipelines');
    let successPipelineId: number | null = null;
    const statusNameById: Record<string, string> = {};
    for (const pipeline of pipelinesData?._embedded?.pipelines ?? []) {
      if (pipeline.name === 'Успешные продажи 2026') {
        successPipelineId = pipeline.id;
        for (const status of pipeline._embedded?.statuses ?? []) {
          statusNameById[status.id] = status.name;
        }
      }
    }

    if (!successPipelineId) {
      return new Response(JSON.stringify({ error: 'Не найдена воронка «Успешные продажи 2026»' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wonLeads = await amoGetAllPages(
      `/api/v4/leads?filter[pipeline_id]=${successPipelineId}&with=contacts&order[id]=desc`,
      10,
      'leads'
    );

    const { data: alreadySynced } = await supabaseAdmin
      .from('amocrm_deal_sync')
      .select('amocrm_lead_id, deal_id');
    const syncedIds = new Set((alreadySynced ?? []).map((r: any) => Number(r.amocrm_lead_id)));
    const dealIdByLead = new Map((alreadySynced ?? []).map((r: any) => [Number(r.amocrm_lead_id), r.deal_id]));

    const newLeads = wonLeads.filter((l: any) => !syncedIds.has(l.id));

    const { data: managers } = await supabaseAdmin
      .from('managers')
      .select('id, amocrm_user_id')
      .not('amocrm_user_id', 'is', null);
    const managerByAmoId = new Map((managers ?? []).map((m: any) => [String(m.amocrm_user_id), m.id]));

    let syncedCount = 0;
    let skippedNoManager = 0;

    for (const lead of newLeads) {
      const managerId = managerByAmoId.get(String(lead.responsible_user_id));
      if (!managerId) {
        skippedNoManager += 1;
        continue;
      }

      const dealDate = lead.closed_at ? kzDateString(lead.closed_at) : kzDateString(Math.floor(Date.now() / 1000));
      const stageName = statusNameById[lead.status_id] ?? '';
      const monthNum = MONTH_STAGE_TO_NUM[stageName];
      const monthYear = monthNum ? `2026-${monthNum}` : dealDate.slice(0, 7);

      const prepayment = getCF(lead, CF.PREPAYMENT);
      const remainder = getCF(lead, CF.REMAINDER);
      const doorType = getCF(lead, CF.DOOR_TYPE);
      const contractNum = getContractNum(lead);
      const contractDateTs = getCF(lead, CF.CONTRACT_DATE);
      let address: string | null = getCF(lead, CF.ADDRESS);
      const paidAmount = prepayment != null ? Number(prepayment) : 0;
      const prepaymentDate = contractDateTs ? kzDateString(Number(contractDateTs)) : null;

      let clientPhone = await leadPhone(lead);
      const filledFromTrello: string[] = [];
      if (!clientPhone || !address) {
        const t = await trelloInfo(contractNum, lead.name);
        if (t?.phone && !clientPhone) { clientPhone = t.phone; filledFromTrello.push('телефон'); }
        if (t?.address && !address) { address = t.address; filledFromTrello.push('адрес'); }
      }

      const extraNotes: string[] = [];
      if (remainder != null) extraNotes.push(`Остаток по данным amoCRM: ${Number(remainder).toLocaleString('ru-RU')} ₸ (проверьте перед подтверждением).`);
      if (filledFromTrello.length) extraNotes.push(`${filledFromTrello.join(' и ')} взяты из карточки Trello.`);

      let paymentMethod = 'Другое';
      const amoChannel = amoPaymentChannel(lead);
      if (amoChannel) paymentMethod = amoChannel;
      else if (clientPhone) {
        const { data: priorDeal } = await supabaseAdmin
          .from('deals')
          .select('payment_method')
          .eq('client_phone', clientPhone)
          .eq('status', 'approved')
          .order('deal_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (priorDeal?.payment_method) paymentMethod = priorDeal.payment_method;
      }

      const { data: newDeal, error: dealErr } = await supabaseAdmin
        .from('deals')
        .insert({
          manager_id: managerId,
          month_year: monthYear,
          deal_date: dealDate,
          client_name: lead.name || `Сделка #${lead.id}`,
          client_phone: clientPhone,
          address,
          door_model: doorType,
          contract_number: contractNum,
          prepayment_date: prepaymentDate,
          payment_method: paymentMethod,
          total_amount: Number(lead.price || 0),
          paid_amount: paidAmount,
          status: 'pending',
          stage: 'closed',
          comment: [
            `Импортировано из amoCRM: "${lead.name}" (лид #${lead.id}, этап «${stageName}»).`,
            amoChannel
              ? `Способ оплаты взят из amoCRM (${paymentMethod}).`
              : paymentMethod !== 'Другое'
              ? `Способ оплаты подставлен по предыдущей сделке этого клиента (${paymentMethod}) — проверьте.`
              : 'Проверьте способ оплаты перед подтверждением.',
            ...extraNotes,
          ].join(' '),
        })
        .select('id')
        .single();

      if (dealErr || !newDeal) continue;

      await supabaseAdmin.from('amocrm_deal_sync').insert({
        amocrm_lead_id: lead.id,
        deal_id: newDeal.id,
      });
      syncedCount += 1;
    }

    let updatedCount = 0;
    let filledCount = 0;
    let approvedMismatch = 0;
    let notified = 0;
    const syncedLeads = wonLeads.filter((l: any) => dealIdByLead.has(l.id));
    const syncedDealIds = syncedLeads.map((l: any) => dealIdByLead.get(l.id)).filter(Boolean);
    const { data: existingDeals } = syncedDealIds.length
      ? await supabaseAdmin.from('deals').select('id, status, total_amount, paid_amount, door_model, address, client_phone, contract_number, manager_id, client_name, payment_method, amo_mismatch').in('id', syncedDealIds)
      : { data: [] as any[] };
    const dealById = new Map((existingDeals ?? []).map((d: any) => [d.id, d]));

    async function writeUpdate(deal: any, update: Record<string, unknown>, by: string) {
      update.updated_at = new Date().toISOString();
      await supabaseAdmin.from('deals').update(update).eq('id', deal.id);
      await supabaseAdmin.from('financial_audit_log').insert(
        Object.entries(update)
          .filter(([k]) => k !== 'updated_at')
          .map(([k, v]) => ({
            entity_type: 'deal', entity_id: deal.id, changed_by: null,
            changed_by_name: by, field_name: k,
            old_value: deal[k] != null ? String(deal[k]) : null, new_value: v != null ? String(v) : null,
          }))
      );
    }

    // ── Изменения из amoCRM не применяются сразу: они ждут подтверждения в разделе «Подтверждения» ──
    let proposed = 0;
    let curLeadId = 0;
    const normText = (v: unknown) => (v == null ? '' : String(v).trim().replace(/\s+/g, ' '));
    // Последние увиденные значения в amoCRM: предлагаем изменение, только если его поменяли в amoCRM
    const { data: snapRows } = await supabaseAdmin.from('external_field_snapshots').select('ext_id, field, value').eq('source', 'amoCRM');
    const snap = new Map((snapRows ?? []).map((r: any) => [`${r.ext_id}|${r.field}`, r.value as string | null]));
    const snapUpserts: { source: string; ext_id: string; field: string; value: string | null; updated_at: string }[] = [];
    /** true — значение в amoCRM изменилось с прошлой проверки (первое знакомство — не изменение) */
    function changedInAmo(leadId: number, field: string, value: unknown): boolean {
      const key = `${leadId}|${field}`;
      const v = value == null ? null : normText(value);
      const had = snap.has(key);
      const prev = snap.get(key) ?? null;
      if (had && prev === v) return false;
      snap.set(key, v);
      snapUpserts.push({ source: 'amoCRM', ext_id: String(leadId), field, value: v, updated_at: new Date().toISOString() });
      return had;
    }
    async function propose(deal: any, field: string, value: unknown, source = 'amoCRM') {
      if (!changedInAmo(curLeadId, field, value)) return;
      const isNum = field === 'total_amount' || field === 'paid_amount';
      const oldV = deal[field];
      if (isNum ? Math.abs(Number(value) - Number(oldV ?? 0)) < 1 : normText(value).toLowerCase() === normText(oldV).toLowerCase()) return;
      if (field === 'client_phone' && normPhone(String(value ?? '')) === normPhone(String(oldV ?? ''))) return;
      const newValue = isNum ? String(Math.round(Number(value))) : normText(value);
      // более старое предложение по этому полю больше не актуально
      await supabaseAdmin.from('deal_change_requests').update({ status: 'superseded' })
        .eq('deal_id', deal.id).eq('field', field).eq('status', 'pending').neq('new_value', newValue);
      const { error } = await supabaseAdmin.from('deal_change_requests').insert({
        deal_id: deal.id, source, field, old_value: oldV == null ? null : String(oldV), new_value: newValue,
      });
      if (!error) proposed += 1; // 23505 — такое предложение уже было (ждёт или отклонено)
    }

    // Телефоны основных контактов — одним запросом на 250 контактов
    const contactPhone = new Map<number, string>();
    const contactIds = [...new Set(syncedLeads.map((l: any) => ((l._embedded?.contacts ?? []).find((c: any) => c.is_main) ?? l._embedded?.contacts?.[0])?.id).filter(Boolean))];
    for (let i = 0; i < contactIds.length; i += 250) {
      const q = contactIds.slice(i, i + 250).map(id => `filter[id][]=${id}`).join('&');
      const data = await amoGet(`/api/v4/contacts?${q}&limit=250`);
      for (const c of data?._embedded?.contacts ?? []) {
        const ph = (c.custom_fields_values ?? []).find((f: any) => f.field_code === 'PHONE')?.values?.[0]?.value;
        if (ph) contactPhone.set(c.id, ph);
      }
    }
    const mainContactId = (l: any) => ((l._embedded?.contacts ?? []).find((c: any) => c.is_main) ?? l._embedded?.contacts?.[0])?.id;

    for (const lead of syncedLeads) {
      const deal = dealById.get(dealIdByLead.get(lead.id));
      if (!deal) continue;
      if (deal.status === 'rejected') continue;
      curLeadId = lead.id;

      // Дозаполняем пустые поля (не перезаписываем) — для любых сделок, в т.ч. подтверждённых
      const fill: Record<string, unknown> = {};
      const contractNum = getContractNum(lead);
      if (!deal.contract_number && contractNum) fill.contract_number = contractNum;
      const amoAddress = getCF(lead, CF.ADDRESS);
      if (!deal.address && amoAddress) fill.address = amoAddress;
      if (!deal.client_phone) {
        const p = await leadPhone(lead);
        if (p) fill.client_phone = p;
      }
      if ((!deal.client_phone && !fill.client_phone) || (!deal.address && !fill.address)) {
        const t = await trelloInfo((fill.contract_number as string) ?? deal.contract_number, deal.client_name ?? lead.name);
        if (t?.phone && !deal.client_phone && !fill.client_phone) fill.client_phone = t.phone;
        if (t?.address && !deal.address && !fill.address) fill.address = t.address;
      }
      if (Object.keys(fill).length > 0) {
        await writeUpdate(deal, fill, 'amoCRM/Trello (дозаполнение)');
        Object.assign(deal, fill);
        filledCount += 1;
      }

      const newTotal = Number(lead.price || 0);
      const prepayment = getCF(lead, CF.PREPAYMENT);
      const newPaid = prepayment != null ? Number(prepayment) : null;

      // Данные клиента (для любых сделок, кроме отклонённых) — на подтверждение
      {
        const ph = contactPhone.get(mainContactId(lead));
        if (ph) await propose(deal, 'client_phone', normPhone(ph) ?? ph);
        if (lead.name && !/^Сделка #\d+$/.test(lead.name)) await propose(deal, 'client_name', lead.name);
        const a = getCF(lead, CF.ADDRESS); if (a) await propose(deal, 'address', a);
        const dt = getCF(lead, CF.DOOR_TYPE); if (dt) await propose(deal, 'door_model', dt);
        if (contractNum) await propose(deal, 'contract_number', contractNum);
        if (newTotal > 0) await propose(deal, 'total_amount', newTotal);
      }

      if (deal.status !== 'pending') {
        // Подтверждённая: суммы не переписываем (оплаты ведутся в A-Finance и связаны с «Финансами»),
        // но сообщаем о расхождении, чтобы его исправили вручную
        const paidDiff = newPaid != null ? Math.round(newPaid - Number(deal.paid_amount)) : 0;
        const totalDiff = 0; // сумма сделки теперь приходит на подтверждение (см. выше)
        if (Math.abs(paidDiff) < 100 && Math.abs(totalDiff) < 100) {
          if (deal.amo_mismatch) await supabaseAdmin.from('deals').update({ amo_mismatch: null }).eq('id', deal.id);
          continue;
        }
        approvedMismatch += 1;
        if (!deal.manager_id) continue;
        const lines: string[] = [];
        if (Math.abs(totalDiff) >= 100) lines.push(`сумма сделки: amoCRM ${fmt(newTotal)}, A-Finance ${fmt(Number(deal.total_amount))}`);
        if (Math.abs(paidDiff) >= 100) {
          lines.push(`оплачено: amoCRM ${fmt(newPaid!)}, A-Finance ${fmt(Number(deal.paid_amount))}` +
            (paidDiff > 0 ? ` — если клиент доплатил, внесите ${fmt(paidDiff)} через «Оплаты»` : ''));
        }
        const body = lines.join('; ');
        if (deal.amo_mismatch !== body) await supabaseAdmin.from('deals').update({ amo_mismatch: body }).eq('id', deal.id);
        const { data: already } = await supabaseAdmin.from('notifications').select('id')
          .eq('type', 'amount_mismatch').eq('deal_id', deal.id).eq('body', body).limit(1).maybeSingle();
        if (!already) {
          await supabaseAdmin.from('notifications').insert({
            manager_id: deal.manager_id,
            type: 'amount_mismatch',
            title: `amoCRM ≠ A-Finance: ${deal.client_name ?? 'клиент'}`.slice(0, 120),
            body,
            deal_id: deal.id,
          });
          notified += 1;
        }
        continue;
      }

      // Сделка ещё на проверке: оплата и способ оплаты — тоже на подтверждение
      if (newPaid != null) await propose(deal, 'paid_amount', newPaid);
      const ch = amoPaymentChannel(lead);
      if (ch && !CHANNELS.includes(deal.payment_method) && deal.payment_method !== 'Несколько способов') await propose(deal, 'payment_method', ch);
    }

    for (let i = 0; i < snapUpserts.length; i += 500) {
      await supabaseAdmin.from('external_field_snapshots').upsert(snapUpserts.slice(i, i + 500), { onConflict: 'source,ext_id,field' });
    }

    return new Response(JSON.stringify({
      synced: syncedCount,
      updated: updatedCount,
      proposed,
      filled: filledCount,
      approvedMismatch,
      notified,
      skippedNoManager,
      checked: wonLeads.length,
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
