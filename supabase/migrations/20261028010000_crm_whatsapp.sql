-- CRM, этап 2: переписка WhatsApp (через Wazzup) в карточке лида
create table if not exists public.crm_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete cascade,
  chat_id text not null,                      -- номер в WhatsApp, только цифры: 77011234567
  channel_id text,
  direction text not null check (direction in ('in', 'out')),
  type text not null default 'text',          -- text | image | audio | video | document | missing_call | …
  text text,
  content_uri text,
  status text,                                -- inbound | sent | delivered | read | error
  error text,
  external_id text unique,                    -- messageId в Wazzup
  author_name text,                           -- кто отправил (для исходящих)
  author_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists crm_messages_lead on public.crm_messages(lead_id, created_at);
create index if not exists crm_messages_chat on public.crm_messages(chat_id, created_at);

alter table public.crm_leads add column if not exists last_message_at timestamptz;
alter table public.crm_leads add column if not exists last_message_text text;
alter table public.crm_leads add column if not exists unread int not null default 0;
-- последние 10 цифр телефона — для поиска лида по номеру из WhatsApp
alter table public.crm_leads add column if not exists phone10 text
  generated always as (nullif(right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 10), '')) stored;
create index if not exists crm_leads_phone10 on public.crm_leads(phone10);

-- настройки WhatsApp: канал Wazzup и кто получает новые лиды (сам ключ — в секретах функций)
create table if not exists public.crm_settings (
  id int primary key default 1 check (id = 1),
  wa_channel_id text,
  wa_phone text,
  new_lead_manager_id uuid references public.managers(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.crm_settings (id) values (1) on conflict do nothing;

alter table public.crm_messages enable row level security;
alter table public.crm_settings enable row level security;
create policy crm_messages_select on public.crm_messages for select to authenticated using (crm_can_lead(lead_id));
create policy crm_settings_read on public.crm_settings for select to authenticated using (true);
create policy crm_settings_admin on public.crm_settings for all to authenticated using (is_admin()) with check (is_admin());

-- прочитано: менеджер открыл чат
create or replace function public.crm_mark_read(p_lead uuid) returns void
language sql security definer set search_path = public as $$
  update crm_leads set unread = 0 where id = p_lead and crm_can_lead(p_lead) and unread <> 0;
$$;
revoke all on function public.crm_mark_read(uuid) from public, anon;
grant execute on function public.crm_mark_read(uuid) to authenticated;

-- обновления в реальном времени: новые сообщения и лиды
do $$ begin
  begin alter publication supabase_realtime add table public.crm_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.crm_leads; exception when duplicate_object then null; end;
end $$;
