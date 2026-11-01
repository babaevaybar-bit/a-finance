import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

// Раз в день: у каждого менеджера ОДНО живое сообщение «Дозаполните сделки» со списком его сделок,
// где не хватает данных (те же правила, что у цветного индикатора). Каждый день не создаём новое —
// обновляем то же сообщение: появилась новая недозаполненная сделка — оно снова «горит» (непрочитано);
// всё исправлено — гаснет. Старые дубли прошлых дней помечаются прочитанными.
// «Дата доплаты» не требуется: остаток доплачивается при поступлении заказа на «Склад Альянс» — дата ставится сама.
// № договора не требуется для мелких покупок «без договора» (has_contract = false).
const CHANNELS = ['Kaspi Bank', 'Halyk Bank', 'Freedom Bank', 'RBK Bank', 'Наличные', 'Перечисление'];
const SPLIT = 'Несколько способов';

function missingOf(d: any): string[] {
  const paid = Number(d.paid_amount) || 0;
  const total = Number(d.total_amount) || 0;
  const validMethod = CHANNELS.includes(d.payment_method) || (d.payment_method === SPLIT && (d.payment_split?.length ?? 0) > 1);
  const m: string[] = [];
  if (!d.client_name?.trim()) m.push('имя клиента');
  if (!d.client_phone?.trim()) m.push('телефон');
  if (!d.address?.trim()) m.push('адрес');
  if (d.has_contract !== false && (!d.contract_number || !/\d/.test(d.contract_number))) m.push('№ договора');
  if (!d.door_model?.trim()) m.push('модель/товар');
  if (!(total > 0)) m.push('сумма');
  if (paid > 0 && !validMethod) m.push('способ оплаты');
  return m;
}
const names = (body: string | null) => new Set((body ?? '').split('\n').filter(l => l.startsWith('•')).map(l => l.slice(1).split(' — ')[0].trim()));

Deno.serve(async () => {
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } });

    const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const { data: deals } = await db.from('deals')
      .select('id, manager_id, client_name, client_phone, address, contract_number, has_contract, door_model, total_amount, paid_amount, payment_method, payment_split, status, deal_date')
      .neq('status', 'rejected').gte('deal_date', since);

    const byManager = new Map<string, string[]>();
    for (const d of deals ?? []) {
      if (!d.manager_id) continue;
      const miss = missingOf(d);
      if (!miss.length) continue;
      const arr = byManager.get(d.manager_id) ?? [];
      arr.push(`• ${d.client_name || 'без имени'} — ${miss.join(', ')}`);
      byManager.set(d.manager_id, arr);
    }

    // все сообщения «Дозаполните сделки»: самое свежее у каждого — живое, остальные — старые дубли
    const { data: existing } = await db.from('notifications').select('id, manager_id, body, is_read, created_at')
      .eq('type', 'incomplete_deals').order('created_at', { ascending: false }).limit(5000);
    const latest = new Map<string, any>();
    const stale: string[] = [];
    for (const n of existing ?? []) {
      if (!latest.has(n.manager_id)) latest.set(n.manager_id, n);
      else if (!n.is_read) stale.push(n.id);
    }
    for (let i = 0; i < stale.length; i += 200) await db.from('notifications').update({ is_read: true }).in('id', stale.slice(i, i + 200));

    let created = 0, updated = 0, cleared = 0;
    for (const [managerId, lines] of byManager) {
      const title = `Дозаполните сделки (${lines.length})`;
      const body = lines.slice(0, 15).join('\n') + (lines.length > 15 ? `\n…и ещё ${lines.length - 15}` : '');
      const cur = latest.get(managerId);
      if (!cur) {
        await db.from('notifications').insert({ manager_id: managerId, type: 'incomplete_deals', title, body });
        created += 1;
      } else if (cur.body !== body) {
        // появилась новая недозаполненная сделка — снова «горит»; просто кто-то дозаполнил часть — не тревожим
        const before = names(cur.body);
        const fresh = [...names(body)].some(n => !before.has(n));
        await db.from('notifications').update({ title, body, ...(fresh ? { is_read: false } : {}) }).eq('id', cur.id);
        updated += 1;
      }
    }
    // у кого всё заполнено — живое сообщение гаснет
    for (const [managerId, cur] of latest) {
      if (byManager.has(managerId) || cur.is_read) continue;
      await db.from('notifications').update({ is_read: true }).eq('id', cur.id);
      cleared += 1;
    }
    return new Response(JSON.stringify({ managers: byManager.size, created, updated, cleared, stale: stale.length }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
