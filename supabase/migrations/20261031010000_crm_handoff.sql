-- Передача лида другому менеджеру одной кнопкой (лидоруб → менеджер).
-- Лидоруб сам по правам не может поставить чужого ответственного, поэтому — через функцию с проверкой:
-- передать может тот, кто может редактировать лида. Открытые задачи переходят новому менеджеру,
-- если задач нет — создаётся «Связаться с клиентом» через 30 минут; в истории — запись «Передан».
create or replace function public.crm_handoff(p_lead uuid, p_to uuid, p_comment text default null, p_stage uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l crm_leads; from_name text; to_name text; who text;
begin
  select * into l from crm_leads where id = p_lead;
  if l.id is null then raise exception 'Лид не найден'; end if;
  if not (data_scope('leads', true) or l.manager_id = my_manager_id()) then raise exception 'Нет прав передать этого лида'; end if;
  select name into to_name from managers where id = p_to and is_active;
  if to_name is null then raise exception 'Менеджер не найден'; end if;
  if l.manager_id is not distinct from p_to then return; end if;
  if p_stage is not null and not exists (select 1 from crm_stages where id = p_stage and pipeline_id = l.pipeline_id) then raise exception 'Неверный этап'; end if;
  select name into from_name from managers where id = l.manager_id;
  select coalesce(nullif(name, 'admin'), email) into who from profiles where id = auth.uid();

  perform set_config('crm.handoff', '1', true);   -- история: одна запись «Передан», без дубля «ответственный: …»
  update crm_leads set manager_id = p_to, stage_id = coalesce(p_stage, stage_id) where id = p_lead;
  update crm_tasks set manager_id = p_to where lead_id = p_lead and done_at is null;
  if not exists (select 1 from crm_tasks where lead_id = p_lead and done_at is null) then
    insert into crm_tasks (lead_id, manager_id, kind, title, due_at, created_by)
    values (p_lead, p_to, 'call', 'Связаться с клиентом', now() + interval '30 minutes', auth.uid());
  end if;
  insert into crm_events (lead_id, kind, text, author_id, author_name)
  values (p_lead, 'handoff', 'Передан: ' || coalesce(from_name, '—') || ' → ' || to_name
          || coalesce(' — ' || nullif(trim(p_comment), ''), ''), auth.uid(), who);
end $$;
revoke all on function public.crm_handoff(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.crm_handoff(uuid, uuid, text, uuid) to authenticated;

-- история лида: при передаче через crm_handoff не пишем отдельное «ответственный: …»
create or replace function public.crm_lead_trg() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_name text; s_old text; s_new text; ch text[] := '{}';
begin
  select coalesce(nullif(name, 'admin'), email) into v_name from profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into crm_events (lead_id, kind, text, author_name) values (new.id, 'created', 'Создан лид', v_name);
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into s_old from crm_stages where id = old.stage_id;
    select name into s_new from crm_stages where id = new.stage_id;
    insert into crm_events (lead_id, kind, text, data, author_name)
      values (new.id, 'stage', coalesce(s_old, '—') || ' → ' || coalesce(s_new, '—'),
              jsonb_build_object('from', old.stage_id, 'to', new.stage_id), v_name);
  end if;
  if new.manager_id is distinct from old.manager_id and coalesce(current_setting('crm.handoff', true), '') <> '1' then
    ch := ch || ('ответственный: ' || coalesce((select name from managers where id = new.manager_id), '—'));
  end if;
  if new.amount is distinct from old.amount then ch := ch || ('сумма: ' || money_kz(old.amount) || ' → ' || money_kz(new.amount)); end if;
  if new.client_name is distinct from old.client_name then ch := ch || ('имя: ' || new.client_name); end if;
  if new.client_phone is distinct from old.client_phone then ch := ch || ('телефон: ' || coalesce(new.client_phone, '—')); end if;
  if new.address is distinct from old.address then ch := ch || 'адрес'::text; end if;
  if new.source is distinct from old.source then ch := ch || ('источник: ' || coalesce(new.source, '—')); end if;
  if array_length(ch, 1) > 0 then
    insert into crm_events (lead_id, kind, text, author_name) values (new.id, 'edit', array_to_string(ch, '; '), v_name);
  end if;
  return new;
end $function$;
