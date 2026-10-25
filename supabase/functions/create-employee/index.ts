import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SITE_URL = 'https://a-finance-five.vercel.app/login';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already') && (m.includes('regist') || m.includes('exists'))) return 'Этот email уже зарегистрирован — укажите другую почту';
  if (m.includes('password') && (m.includes('6') || m.includes('short') || m.includes('weak'))) return 'Пароль слишком простой — минимум 8 символов, буквы и цифры (или нажмите «Сгенерировать»)';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Слишком много писем за короткое время — подождите пару минут';
  if (m.includes('invalid') && m.includes('email')) return 'Неправильный формат email';
  return msg;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);
    const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', user.id).single();
    if (callerProfile?.role !== 'director') return json({ error: 'Только Главный админ может управлять аккаунтами' }, 403);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const publicClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json();
    const action = body.action ?? 'create';

    if (action === 'status') {
      const { data, error } = await admin.auth.admin.getUserById(body.userId);
      if (error || !data?.user) return json({ error: 'Аккаунт не найден' });
      return json({
        email: data.user.email,
        confirmed: !!data.user.email_confirmed_at,
        lastSignIn: data.user.last_sign_in_at ?? null,
      });
    }

    if (action === 'resend') {
      const { error } = await publicClient.auth.resend({ type: 'signup', email: String(body.email).trim().toLowerCase(), options: { emailRedirectTo: SITE_URL } });
      if (error) return json({ error: translate(error.message) });
      return json({ ok: true });
    }

    if (action === 'delete') {
      if (body.userId === user.id) return json({ error: 'Нельзя удалить собственный аккаунт' });
      await admin.from('managers').update({ user_id: null }).eq('user_id', body.userId);
      await admin.from('profiles').delete().eq('id', body.userId);
      const { error } = await admin.auth.admin.deleteUser(body.userId);
      if (error && !error.message.toLowerCase().includes('not found')) return json({ error: error.message });
      return json({ ok: true });
    }

    if (action === 'confirm') {
      const { error } = await admin.auth.admin.updateUserById(body.userId, { email_confirm: true });
      if (error) return json({ error: translate(error.message) });
      return json({ ok: true });
    }

    // Главный админ задаёт сотруднику новый пароль (сотрудник забыл / ввёл не тот) — почта тоже подтверждается
    if (action === 'set_password') {
      const pw = String(body.password ?? '');
      if (pw.length < 8 || !/[a-zа-яё]/i.test(pw) || !/\d/.test(pw)) return json({ error: 'Пароль — минимум 8 символов, буквы и цифры' });
      const { error } = await admin.auth.admin.updateUserById(body.userId, { password: pw, email_confirm: true });
      if (error) return json({ error: translate(error.message) });
      return json({ ok: true });
    }

    const { username, password, managerId, role, recoveryEmail } = body;
    if (!username || !password || !managerId) return json({ error: 'Заполните логин и пароль' });
    if (String(password).length < 8) return json({ error: 'Пароль — минимум 8 символов' });
    if (!recoveryEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) return json({ error: 'Укажите настоящую почту сотрудника' });
    const assignedRole = ['director', 'director_view', 'rop', 'manager', 'lidorub'].includes(role) ? role : 'manager';
    const email = String(recoveryEmail).trim().toLowerCase();
    const login = String(username).trim().toLowerCase();

    const { data: taken } = await admin.from('profiles').select('id').eq('name', login).maybeSingle();
    if (taken) return json({ error: 'Такой логин уже занят — придумайте другой' });

    // Аккаунт создаётся сразу подтверждённым: письмо не нужно, сотрудник входит логином и паролем
    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr || !created?.user) return json({ error: translate(createErr?.message ?? 'Аккаунт не создан') });
    const newUser = created.user;

    const { error: profErr } = await admin.from('profiles').insert({
      id: newUser.id,
      name: login,
      email,
      role: assignedRole,
      manager_id: managerId,
    });
    if (profErr) {
      await admin.auth.admin.deleteUser(newUser.id);
      const msg = profErr.message.includes('duplicate') ? 'Такой логин уже занят — придумайте другой' : `Профиль не создан: ${profErr.message}`;
      return json({ error: msg });
    }

    return json({ userId: newUser.id, confirmed: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
