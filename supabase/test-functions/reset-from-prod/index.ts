// Только для ТЕСТОВОЙ базы (проект A-finance-test): «Сбросить к боевой» — копирует все данные и логины с боевой базы.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const PROD_URL = 'https://xmqdszuwrcmhtakmfrah.supabase.co';
// публичный (anon) ключ боевой базы — сам по себе ничего не даёт; выгрузка защищена секретным ключом из prod_sync
const PROD_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtcWRzenV3cmNtaHRha21mcmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzEyMzksImV4cCI6MjEwMjEwNzIzOX0.b3uEqRMVpVKmdZNY-VdVRBk9sr85dJU_eySmxECeEzo';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    if (url.includes('xmqdszuwrcmhtakmfrah')) return json({ error: 'Это боевая база — сброс запрещён' }, 400);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: prof } = await admin.from('profiles').select('role, name').eq('id', user.id).maybeSingle();
    if (prof?.role !== 'director') return json({ error: 'Сбросить тест может только Главный админ' }, 403);

    const { data: key } = await admin.from('prod_sync').select('token').eq('id', 1).single();
    const res = await fetch(`${PROD_URL}/rest/v1/rpc/export_for_test`, {
      method: 'POST',
      headers: { apikey: PROD_ANON, Authorization: `Bearer ${PROD_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: key?.token }),
    });
    if (!res.ok) return json({ error: `Боевая база не отдала данные (${res.status})` }, 502);
    const snapshot = await res.json();
    const { data, error } = await admin.rpc('import_from_prod', { p: snapshot, p_by: prof?.name ?? user.email });
    if (error) return json({ error: `Не удалось загрузить: ${error.message}` }, 500);
    return json({ ok: true, counts: data });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
