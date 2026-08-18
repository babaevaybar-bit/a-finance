
-- 1. Таблица ежедневных отчётов
CREATE TABLE IF NOT EXISTS daily_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date   date NOT NULL,
  channel       text NOT NULL,          -- источник/канал маркетинга
  new_clients   integer NOT NULL DEFAULT 0,
  leads         integer NOT NULL DEFAULT 0,
  closed_deals  integer NOT NULL DEFAULT 0,
  sales_amount  numeric(15,2) NOT NULL DEFAULT 0,
  ad_cost       numeric(15,2) NOT NULL DEFAULT 0,
  comment       text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- Все аутентифицированные могут читать и писать (контроль через PERMISSION_PAGES)
CREATE POLICY "auth_all_daily_reports" ON daily_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Расширяем profit_rows: добавляем тип percentage_of_revenue и поле percent
ALTER TABLE profit_rows ADD COLUMN IF NOT EXISTS row_type_v2 text;
ALTER TABLE profit_rows ADD COLUMN IF NOT EXISTS percent numeric(8,4) DEFAULT 0;

-- Заполняем row_type_v2 из row_type для совместимости
UPDATE profit_rows SET row_type_v2 = row_type WHERE row_type_v2 IS NULL;

-- 3. Индексы
CREATE INDEX IF NOT EXISTS daily_reports_date_idx ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS daily_reports_channel_idx ON daily_reports(channel);
