-- Связь клиентов по телефону: у каждой записи с телефоном — список «ключей» (последние 10 цифр каждого номера).
-- Понимает: +7 777 111 10 18 · 8 777 111 1018 · 87771111018 · 7771111018 · 8(777)111-10-18 · +7 7771111018 ·
-- «+7 777 966 9222 (номер дизайнера)» · несколько номеров через запятую/пробел/«и».
create or replace function public.phone_key1(d text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when length(d) = 10 and left(d, 1) in ('7', '6') then d                          -- 7771111018
    when length(d) = 11 and left(d, 1) in ('7', '8') then right(d, 10)               -- 87771111018 / 77771111018
    when length(d) = 12 and left(d, 2) in ('77', '78') then right(d, 10)             -- лишняя цифра кода: +7 77771111018, +7 87771111018
    when length(d) = 13 and left(d, 3) in ('007', '787', '877') then right(d, 10)
    else null
  end
$$;

create or replace function public.phone_keys(raw text)
returns text[]
language plpgsql
immutable
parallel safe
as $$
declare
  m text[];
  d text;
  k text;
  a text;
  b text;
  out text[] := '{}';
begin
  for m in select regexp_matches(coalesce(raw, ''), '(\+?\d[\d\s\-\(\).]{6,40}\d)', 'g') loop
    d := regexp_replace(m[1], '\D', '', 'g');
    k := public.phone_key1(d);
    if k is not null then
      out := out || k;
    elsif length(d) between 20 and 26 then
      -- два номера подряд через пробел: «87771111018 87772223344»
      for i in 10..11 loop
        a := public.phone_key1(left(d, i));
        b := public.phone_key1(substr(d, i + 1));
        if a is not null and b is not null then out := out || a || b; exit; end if;
      end loop;
    end if;
  end loop;
  return (select coalesce(array_agg(distinct x order by x), '{}') from unnest(out) x);
end
$$;

-- Ключи в таблицах с телефоном клиента
alter table public.deals          add column if not exists phone_keys text[] generated always as (public.phone_keys(client_phone)) stored;
alter table public.client_reports add column if not exists phone_keys text[] generated always as (public.phone_keys(client_phone)) stored;
alter table public.crm_leads      add column if not exists phone_keys text[] generated always as (public.phone_keys(client_phone)) stored;
alter table public.offline_leads  add column if not exists phone_keys text[] generated always as (public.phone_keys(client_phone)) stored;
create index if not exists deals_phone_keys          on public.deals          using gin (phone_keys);
create index if not exists client_reports_phone_keys on public.client_reports using gin (phone_keys);
create index if not exists crm_leads_phone_keys      on public.crm_leads      using gin (phone_keys);
create index if not exists offline_leads_phone_keys  on public.offline_leads  using gin (phone_keys);

do $$
begin
  if to_regclass('public.price_estimates') is not null then
    execute 'alter table public.price_estimates add column if not exists phone_keys text[] generated always as (public.phone_keys(client_phone)) stored';
    execute 'create index if not exists price_estimates_phone_keys on public.price_estimates using gin (phone_keys)';
  end if;
end $$;
