
-- Таблица отчётов по клиентам (заполняется менеджерами)
CREATE TABLE IF NOT EXISTS client_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date      date NOT NULL DEFAULT CURRENT_DATE,
  manager_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Клиент
  client_name      text NOT NULL,
  client_phone     text,
  client_quality   text NOT NULL DEFAULT 'cold', -- 'cold' | 'warm' | 'hot'

  -- Объект
  address          text,          -- адрес / ЖК / дом
  property_type    text,          -- квартира, дом, коммерция, земля и т.д.
  area_sqm         numeric(10,2), -- площадь, м²
  budget           numeric(15,2), -- бюджет клиента

  -- Работа с клиентом
  source           text,          -- канал: Instagram, реклама, реферал и т.д.
  contact_type     text,          -- звонок, встреча, онлайн
  deal_stage       text DEFAULT 'new', -- new | negotiation | viewing | offer | closed | rejected
  next_action      text,          -- следующий шаг
  next_action_date date,          -- дата следующего шага

  -- Итог
  is_deal_closed   boolean NOT NULL DEFAULT false,
  deal_amount      numeric(15,2) DEFAULT 0,
  comment          text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_client_reports" ON client_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS client_reports_date_idx    ON client_reports(report_date);
CREATE INDEX IF NOT EXISTS client_reports_manager_idx ON client_reports(manager_id);
CREATE INDEX IF NOT EXISTS client_reports_quality_idx ON client_reports(client_quality);
CREATE INDEX IF NOT EXISTS client_reports_stage_idx   ON client_reports(deal_stage);
