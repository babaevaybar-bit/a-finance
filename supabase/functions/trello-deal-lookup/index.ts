import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOARD_ID = '69ac06dcb59ad75791c3385b';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

// Номер договора → ключ. «26-63», «26/63», «26-00-63» → «26:63»; подномер сохраняется:
// «26-63/1» → «26:63:1» (это ДРУГОЙ договор). Такой же ключ, как contractKey на сайте.
function contractKey(raw: string | null | undefined): string | null {
  const groups = (raw ?? '').match(/\d+/g);
  if (!groups || groups.length === 0) return null;
  const nums = groups.map(g => String(parseInt(g, 10)));
  const parts = nums.filter((n, i) => !(n === '0' && i > 0 && i < nums.length - 1));
  return parts.length === 1 ? `:${parts[0]}` : parts.join(':');
}

// Номер в сделке без года («57», «43/5») совпадает с карточкой с годом («26-00-57», «26-00-43/5»)
function contractsMatch(cardKey: string | null, dealKey: string | null): boolean {
  if (!cardKey || !dealKey) return false;
  if (cardKey === dealKey) return true;
  const card = cardKey.split(':').filter(Boolean);
  const deal = dealKey.split(':').filter(Boolean);
  return card.length === deal.length + 1 && card.slice(1).join(':') === deal.join(':');
}

// Код в начале названия карточки: «26-00-63/1 - Меруерт …» → «26-00-63/1»
function cardCode(cardName: string): string | null {
  const m = cardName.match(/^\s*(\d[\d.\-/]*)/);
  return m ? m[1] : null;
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

    const url = new URL(req.url);
    const phoneParam = url.searchParams.get('phone') ?? '';
    const contractParam = url.searchParams.get('contract') ?? '';
    if (!phoneParam && !contractParam) {
      return new Response(JSON.stringify({ error: 'Нужен phone или contract' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const targetPhone = phoneParam ? normalizePhone(phoneParam) : null;
    const targetContract = contractKey(contractParam);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: settings, error: settingsErr } = await supabaseAdmin
      .from('trello_settings')
      .select('api_key, token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (settingsErr || !settings) {
      return new Response(JSON.stringify({ error: 'Trello не подключен' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const auth = `key=${settings.api_key}&token=${settings.token}`;

    const listsRes = await fetch(
      `https://api.trello.com/1/boards/${BOARD_ID}/lists?fields=id,name,closed&cards=open&card_fields=id,name,desc,due,dateLastActivity,shortUrl&labels=true&${auth}`
    );
    if (!listsRes.ok) {
      return new Response(JSON.stringify({ error: `Trello API: ${listsRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const lists = await listsRes.json();

    const byContract: any[] = [];
    const byPhone: any[] = [];
    for (const list of lists ?? []) {
      if (list.closed) continue;
      for (const card of list.cards ?? []) {
        const item = {
          id: card.id,
          name: card.name,
          desc: card.desc,
          due: card.due,
          dateLastActivity: card.dateLastActivity,
          url: card.shortUrl,
          stage: list.name,
          labels: (card.labels ?? []).map((lb: any) => ({ name: lb.name, color: lb.color })),
        };
        const code = cardCode(card.name);
        if (targetContract && code && contractsMatch(contractKey(code), targetContract)) {
          byContract.push({ ...item, matchedBy: 'contract' });
          continue;
        }
        const haystack = `${card.name} ${card.desc ?? ''}`;
        if (targetPhone && targetPhone.length >= 7 && normalizePhone(haystack).includes(targetPhone)) {
          byPhone.push({ ...item, matchedBy: 'phone' });
        }
      }
    }
    // Точное совпадение по договору важнее телефона: у одного клиента бывает несколько заказов
    // (например, двери и отдельно фурнитура) с одним телефоном, но разными договорами.
    // Если по договору карточка найдена — показываем только её; телефон — только когда по договору пусто.
    const matches = byContract.length ? byContract : byPhone;

    let comments: any[] = [];
    if (matches[0]) {
      const commentsRes = await fetch(
        `https://api.trello.com/1/cards/${matches[0].id}/actions?filter=commentCard&limit=20&${auth}`
      );
      if (commentsRes.ok) {
        const actions = await commentsRes.json();
        comments = (actions ?? []).map((a: any) => ({
          text: a.data?.text ?? '',
          date: a.date,
          by: a.memberCreator?.fullName ?? null,
        }));
      }
    }

    return new Response(JSON.stringify({ matches, comments }), {
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
