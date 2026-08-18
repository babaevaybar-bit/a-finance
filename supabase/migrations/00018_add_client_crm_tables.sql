
-- 1. Расширяем client_reports: теги, источник лида
ALTER TABLE client_reports ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE client_reports ADD COLUMN IF NOT EXISTS lead_source text DEFAULT 'other';
-- lead_source: 'ads' | 'social' | 'referral' | 'website' | 'cold_call' | 'other'

-- 2. История взаимодействий с клиентом
CREATE TABLE IF NOT EXISTS client_interactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES client_reports(id) ON DELETE CASCADE,
  author_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  interaction_type text NOT NULL DEFAULT 'comment', -- 'call' | 'meeting' | 'message' | 'comment'
  content       text NOT NULL,
  interacted_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE client_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_interactions" ON client_interactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ci_client_idx ON client_interactions(client_id);

-- 3. Задачи/напоминания по клиенту
CREATE TABLE IF NOT EXISTS client_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES client_reports(id) ON DELETE CASCADE,
  assigned_to   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title         text NOT NULL,
  due_date      date,
  is_done       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE client_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_tasks" ON client_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ct_client_idx ON client_tasks(client_id);
CREATE INDEX IF NOT EXISTS ct_due_idx    ON client_tasks(due_date);

-- 4. Лог изменений стадии/статуса
CREATE TABLE IF NOT EXISTS client_change_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES client_reports(id) ON DELETE CASCADE,
  changed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  field_name    text NOT NULL,   -- 'deal_stage' | 'client_quality' | 'is_deal_closed' | ...
  old_value     text,
  new_value     text,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE client_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_changelog" ON client_change_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ccl_client_idx ON client_change_log(client_id);
