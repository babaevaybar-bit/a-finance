import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOARD_ID = '69ac06dcb59ad75791c3385b';
const TOLERANCE = 100; // разница меньше 100 ₸ — округление, не расхождение

// Доплата: клиент доплачивает остаток, когда заказ из производства приходит на «Склад Альянс».
// Этапы, начиная с которых остаток считается «пора платить».
const PAYMENT_DUE_STAGES = ['Склад Альянс', 'Склад Шымкент', 'План к установке', 'Ожидание готовности объекта', 'Обект Сдан'];
const isDueStage = (s: string | null | undefined) => !!s && PAYMENT_DUE_STAGES.includes(s.trim());
const KZ_OFFSET_MS = 5 * 3600 * 1000;
const kzToday = () => new Date(Date.now() + KZ_OFFSET_MS).toISOString().slice(0, 10);

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// Сумма из названия карточки: «... - 2 500 000тг - ...» → 2500000; «1 714 737,71тг» → 1714738
function amountFromCardName(name: string): number | null {
  for (const part of name.split(/\s-\s/)) {
    const m = part.match(/^\s*([\d][\d\s.,]*)\s*тг/i);
    if (m) {
      let raw = m[1].replace(/\s/g, '');
      let frac = 0;
      const fm = raw.match(/[.,](\d{1,2})$/);
      if (fm) { frac = Number(fm[1].padEnd(2, '0')) / 100; raw = raw.slice(0, -fm[0].length); }
      const n = Number(raw.replace(/[.,]/g, '')) + frac;
      if (n > 0) return Math.round(n);
    }
  }
  return null;
}

// Номер договора → ключ: «26-57», «26/57», «26-00-57» → «26:57»; «57» → «:57».
// Подномер сохраняется: «26/61/1» → «26:61:1» — это другой договор, чем «26/65/1» или «26/61».
// (Раньше брался только последний сегмент, и «26/61/1» путался с «26-00-65/1».)
function contractKey(s: string | null | undefined): string | null {
  const groups = (s ?? '').match(/\d+/g);
  if (!groups || groups.length === 0) return null;
  const nums = groups.map(g => String(parseInt(g, 10)));
  const parts = nums.filter((n, i) => !(n === '0' && i > 0 && i < nums.length - 1));
  return parts.length === 1 ? `:${parts[0]}` : parts.join(':');
}
// Номер в сделке без года («57», «43/5») совпадает с номером карточки с годом
// («26-00-57», «26-00-43/5»): у карточки ровно на одну часть больше спереди (год).
// Только в эту сторону — иначе служебные карточки «1)…5)» совпадали бы с «…/5».
function contractsMatch(cardKey: string | null, dealKey: string | null): boolean {
  if (!cardKey || !dealKey) return false;
  if (cardKey === dealKey) return true;
  const card = cardKey.split(':').filter(Boolean);
  const deal = dealKey.split(':').filter(Boolean);
  return card.length === deal.length + 1 && card.slice(1).join(':') === deal.join(':');
}

// Код договора в начале названия карточки: «26-00-57 - Клиент - ...», «26-00-61/7 - ...»
function cardContractKey(name: string): string | null {
  const m = name.match(/^\s*(\d[\d.\-/]*\d|\d)\b/);
  return m ? contractKey(m[1]) : null;
}

// Green-API: адрес своего инстанса (общий api.green-api.com больше не отвечает) + таймаут,
// чтобы зависший WhatsApp не ломал сохранение этапов
async function sendWhatsApp(supabaseAdmin: any, phone: string | null, text: string) {
  if (!phone) return;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return;
  const { data: ga } = await supabaseAdmin
    .from('green_api_settings')
    .select('id_instance, api_token_instance, api_url')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ga) return;
  const base = (ga.api_url || `https://${String(ga.id_instance).slice(0, 4)}.api.green-api.com`).replace(/\/$/, '');
  try {
    await fetch(`${base}/waInstance${ga.id_instance}/sendMessage/${ga.api_token_instance}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: `${digits}@c.us`, message: text }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { /* best effort */ }
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

    let settings: any = null;
    for (let i = 0; i < 2 && !settings; i++) {
      const { data } = await supabaseAdmin.from('trello_settings').select('api_key, token')
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      settings = data;
    }
    if (!settings) {
      return new Response(JSON.stringify({ error: 'Trello не подключен' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const auth = `key=${settings.api_key}&token=${settings.token}`;
    const listsRes = await fetch(
      `https://api.trello.com/1/boards/${BOARD_ID}/lists?fields=id,name,closed&cards=open&card_fields=id,name&${auth}`
    );
    if (!listsRes.ok) {
      return new Response(JSON.stringify({ error: `Trello API: ${listsRes.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const lists = await listsRes.json();

    // Порядок колонок на доске — чтобы у сделки из нескольких карточек брать самый «ранний» этап
    const stageOrder = new Map<string, number>();
    const currentCards: { id: string; name: string; stage: string; phone: string | null; contract: string | null }[] = [];
    (lists ?? []).forEach((list: any, i: number) => {
      if (list.closed) return;
      stageOrder.set(list.name, i);
      for (const card of list.cards ?? []) {
        const m = card.name.match(/(\+?7|8)[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/);
        currentCards.push({
          id: card.id, name: card.name, stage: list.name,
          phone: m ? normalizePhone(m[0]) : null,
          contract: cardContractKey(card.name),
        });
      }
    });

    const { data: snapshots } = await supabaseAdmin
      .from('production_stage_snapshots')
      .select('trello_card_id, last_stage');
    const knownStage = new Map((snapshots ?? []).map((s: any) => [s.trello_card_id, s.last_stage]));

    const { data: deals } = await supabaseAdmin
      .from('deals')
      .select('id, manager_id, client_phone, client_name, address, total_amount, paid_amount, next_payment_date, status, contract_number, production_stage, created_at')
      .neq('status', 'rejected')
      .order('created_at', { ascending: true });
    const dealsByPhone = new Map<string, any[]>();
    for (const d of deals ?? []) {
      if (!d.client_phone) continue;
      const k = normalizePhone(d.client_phone);
      dealsByPhone.set(k, [...(dealsByPhone.get(k) ?? []), d]);
    }
    const { data: managersData } = await supabaseAdmin.from('managers').select('id, phone');
    const managerPhone = new Map((managersData ?? []).map((m: any) => [m.id, m.phone]));

    let notified = 0;
    let seeded = 0;
    let mismatches = 0;
    let paymentDue = 0;
    let stagesUpdated = 0;
    const today = kzToday();

    // ── Данные клиента из карточки Trello: если их там поменяли — изменение ждёт подтверждения в A-Finance ──
    const { data: snapRows } = await supabaseAdmin.from('external_field_snapshots').select('ext_id, field, value').eq('source', 'Trello');
    const snap = new Map((snapRows ?? []).map((r: any) => [`${r.ext_id}|${r.field}`, r.value as string | null]));
    const snapUpserts: any[] = [];
    let proposed = 0;
    const ADDRESS_HINT = /(^|\s)(г\.?|город|ЖК|ул\.?|улица|проезд|мкр|микрорайон|пр\.?|проспект|район|с\.|село|пос)(\s|\.|,|$)/i;
    const cardAddress = (name: string) => {
      for (const p of name.split(/\s+-\s+/).map(x => x.trim()).filter(Boolean).slice(1)) {
        if (ADDRESS_HINT.test(p) && p.replace(/\D/g, '').length < 10) return p.replace(/[.\s]+$/, '');
      }
      return null;
    };
    async function proposeFromCard(deal: any, cardId: string, field: 'client_phone' | 'address', value: string | null) {
      const key = `${cardId}|${field}`;
      const had = snap.has(key);
      if (had && snap.get(key) === value) return;
      snap.set(key, value);
      snapUpserts.push({ source: 'Trello', ext_id: cardId, field, value, updated_at: new Date().toISOString() });
      if (!had || !value) return; // первое знакомство с карточкой — не изменение
      const cur = deal[field] ?? '';
      const same = field === 'client_phone' ? normalizePhone(String(cur)) === normalizePhone(value) : String(cur).trim().toLowerCase() === value.trim().toLowerCase();
      if (same) return;
      await supabaseAdmin.from('deal_change_requests').update({ status: 'superseded' })
        .eq('deal_id', deal.id).eq('field', field).eq('status', 'pending').neq('new_value', value);
      const { error } = await supabaseAdmin.from('deal_change_requests').insert({
        deal_id: deal.id, source: 'Trello', field, old_value: deal[field] ?? null, new_value: value,
      });
      if (!error) proposed += 1;
    }

    for (const deal of deals ?? []) {
      const dPhone = deal.client_phone ? normalizePhone(deal.client_phone) : null;
      const dContract = contractKey(deal.contract_number);
      let matched: typeof currentCards = [];
      if (dContract) {
        // Полный номер (с годом и подномером) совпал — этого достаточно: телефон в карточке бывает другой
        // (например, номер прораба или дизайнера). Короткий номер без года — дополнительно сверяем телефон.
        matched = currentCards.filter(c => c.contract === dContract && !dContract.startsWith(':'));
        // Одинаковый номер у нескольких карточек (бывает при ошибке в номере) — уточняем по телефону
        if (matched.length > 1 && dPhone) {
          const samePhone = matched.filter(c => c.phone === dPhone);
          if (samePhone.length) matched = samePhone;
        }
        if (matched.length === 0) {
          matched = currentCards.filter(c => contractsMatch(c.contract, dContract) && (!dPhone || !c.phone || c.phone === dPhone));
        }
      }
      if (matched.length === 0 && dPhone) {
        const byPhone = currentCards.filter(c => c.phone === dPhone);
        if (byPhone.length === 1 && (dealsByPhone.get(dPhone)?.length ?? 0) === 1) matched = byPhone;
      }
      if (matched.length === 0) continue;

      // Только надёжное совпадение по полному номеру договора с одной карточкой
      if (matched.length === 1 && dContract && !dContract.startsWith(':') && matched[0].contract === dContract) {
        const c = matched[0];
        await proposeFromCard(deal, c.id, 'client_phone', c.phone ? '+7' + c.phone : null);
        await proposeFromCard(deal, c.id, 'address', cardAddress(c.name));
      }

      // ── Этап производства сделки и доплата при поступлении на «Склад Альянс» ──
      const stage = [...matched].sort((a, b) => (stageOrder.get(a.stage) ?? 0) - (stageOrder.get(b.stage) ?? 0))[0].stage;
      const prevStage: string | null = deal.production_stage ?? null;
      if (prevStage !== stage) {
        const rest = Math.round(Number(deal.total_amount) - Number(deal.paid_amount));
        const becameDue = isDueStage(stage) && !isDueStage(prevStage);
        const patch: Record<string, unknown> = { production_stage: stage, production_stage_at: new Date().toISOString() };
        // Пришло время доплаты: дата доплаты = сегодня (если не стоит более ранняя)
        if (becameDue && rest > 0 && (!deal.next_payment_date || deal.next_payment_date > today)) patch.next_payment_date = today;
        await supabaseAdmin.from('deals').update(patch).eq('id', deal.id);
        stagesUpdated += 1;
        // Сообщение — только при реальном переходе (не при первом заполнении этапа)
        if (becameDue && rest > 0 && prevStage !== null && deal.manager_id) {
          const title = `Пора доплатить: ${deal.client_name ?? 'клиент'}`.slice(0, 120);
          const body = `Заказ поступил на «${stage}». Остаток к оплате: ${rest.toLocaleString('ru-RU')} ₸`;
          await supabaseAdmin.from('notifications').insert({
            manager_id: deal.manager_id, type: 'payment_due', title, body, deal_id: deal.id, trello_card_id: matched[0].id,
          });
          await sendWhatsApp(supabaseAdmin, managerPhone.get(deal.manager_id) ?? null, `💰 ${title}\n${body}`);
          paymentDue += 1;
        }
      }

      // ── Расхождение сумм Trello / A-Finance ──
      if (!deal.manager_id) continue;
      const amounts = matched.map(c => amountFromCardName(c.name));
      if (amounts.some(a => a == null)) continue;
      const trelloSum = (amounts as number[]).reduce((s, a) => s + a, 0);
      const dealSum = Math.round(Number(deal.total_amount));
      if (Math.abs(trelloSum - dealSum) < TOLERANCE) continue;
      mismatches += 1;
      const parts = matched.length > 1 ? ` (${matched.length} карточки)` : '';
      const body = `В Trello${parts}: ${trelloSum.toLocaleString('ru-RU')} ₸, в amoCRM / A-Finance: ${dealSum.toLocaleString('ru-RU')} ₸ (разница ${Math.abs(trelloSum - dealSum).toLocaleString('ru-RU')} ₸)`;
      const { data: already } = await supabaseAdmin.from('notifications').select('id')
        .eq('type', 'amount_mismatch').eq('deal_id', deal.id).eq('body', body).limit(1).maybeSingle();
      if (!already) {
        await supabaseAdmin.from('notifications').insert({
          manager_id: deal.manager_id,
          type: 'amount_mismatch',
          title: `Сумма не совпадает: ${deal.client_name ?? 'клиент'}`.slice(0, 120),
          body,
          deal_id: deal.id,
          trello_card_id: matched[0].id,
        });
        notified += 1;
      }
    }

    // ── Смена этапа в производстве ──
    // Сначала запоминаем новый этап, потом шлём WhatsApp — чтобы сбой отправки не давал повторов
    for (const card of currentCards) {
      const previousStage = knownStage.get(card.id);
      if (previousStage === undefined) {
        await supabaseAdmin.from('production_stage_snapshots').insert({ trello_card_id: card.id, last_stage: card.stage });
        seeded += 1;
        continue;
      }
      if (previousStage !== card.stage) {
        await supabaseAdmin
          .from('production_stage_snapshots')
          .update({ last_stage: card.stage, updated_at: new Date().toISOString() })
          .eq('trello_card_id', card.id);
        const list = card.phone ? dealsByPhone.get(card.phone) : null;
        const managerId = list && list.length ? list[list.length - 1].manager_id : null;
        if (managerId) {
          const title = `Этап изменён: ${card.name.split(' - ')[1] ?? card.name}`.slice(0, 120);
          const body = `${previousStage} → ${card.stage}`;
          await supabaseAdmin.from('notifications').insert({
            manager_id: managerId, type: 'stage_changed', title, body, trello_card_id: card.id,
          });
          notified += 1;
          await sendWhatsApp(supabaseAdmin, managerPhone.get(managerId) ?? null, `🏭 ${title}\n${body}`);
        }
      }
    }

    for (let i = 0; i < snapUpserts.length; i += 500) {
      await supabaseAdmin.from('external_field_snapshots').upsert(snapUpserts.slice(i, i + 500), { onConflict: 'source,ext_id,field' });
    }

    return new Response(JSON.stringify({ checked: currentCards.length, notified, seeded, mismatches, stagesUpdated, paymentDue, proposed }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
