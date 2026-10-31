-- Передача лида с задачей: лидоруб сразу ставит менеджеру, что сделать и когда.
-- Если задача указана — старые открытые задачи закрываются («передан менеджеру»), новому ставится эта.
-- Если не указана — как раньше: открытые задачи переходят новому, а если их нет — «Связаться с клиентом» через 30 минут.
drop function if exists public.crm_handoff(uuid, uuid, text, uuid);

create or replace function public.crm_handoff(p_lead uuid, p_to uuid, p_comment text default null, p_stage uuid default null,
  p_task_kind text default null, p_task_title text default null, p_task_due timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l crm_leads; from_name text; to_name text; who text; t_title text;
begin
  select * into l from crm_leads where id = p_lead;
  if l.id is null then raise exception 'Лид не найден'; end if;
  if not (data_scope('leads', true) or l.manager_id = my_manager_id()) then raise exception 'Нет прав передать этого лида'; end if;
  select name into to_name from managers where id = p_to and is_active;
  if to_name is null then raise exception 'Менеджер не найден'; end if;
  if l.manager_id is not distinct from p_to then return; end if;
  if p_stage is not null and not exists (select 1 from crm_stages where id = p_stage and pipeline_id = l.pipeline_id) then raise exception 'Неверный этап'; end if;
  if p_task_due is not null and p_task_kind not in ('call', 'meeting', 'measure', 'message', 'other') then raise exception 'Неверный тип задачи'; end if;
  select name into from_name from managers where id = l.manager_id;
  select coalesce(nullif(name, 'admin'), email) into who from profiles where id = auth.uid();

  perform set_config('crm.handoff', '1', true);   -- история: одна запись «Передан», без дубля «ответственный: …»
  update crm_leads set manager_id = p_to, stage_id = coalesce(p_stage, stage_id) where id = p_lead;

  if p_task_due is not null then
    update crm_tasks set done_at = now(), result = 'Передан менеджеру ' || to_name where lead_id = p_lead and done_at is null;
    t_title := coalesce(nullif(trim(p_task_title), ''),
      case p_task_kind when 'call' then 'Позвонить' when 'message' then 'Написать' when 'meeting' then 'Встреча' when 'measure' then 'Замер' else 'Задача' end);
    insert into crm_tasks (lead_id, manager_id, kind, title, due_at, created_by) values (p_lead, p_to, p_task_kind, t_title, p_task_due, auth.uid());
  else
    update crm_tasks set manager_id = p_to where lead_id = p_lead and done_at is null;
    if not exists (select 1 from crm_tasks where lead_id = p_lead and done_at is null) then
      insert into crm_tasks (lead_id, manager_id, kind, title, due_at, created_by)
      values (p_lead, p_to, 'call', 'Связаться с клиентом', now() + interval '30 minutes', auth.uid());
    end if;
  end if;

  insert into crm_events (lead_id, kind, text, author_id, author_name)
  values (p_lead, 'handoff', 'Передан: ' || coalesce(from_name, '—') || ' → ' || to_name
          || coalesce(' — ' || nullif(trim(p_comment), ''), '')
          || coalesce('. Задача: ' || t_title || ' — ' || to_char(p_task_due at time zone 'Asia/Qyzylorda', 'DD.MM HH24:MI'), ''),
          auth.uid(), who);
end $$;
revoke all on function public.crm_handoff(uuid, uuid, text, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.crm_handoff(uuid, uuid, text, uuid, text, text, timestamptz) to authenticated;
