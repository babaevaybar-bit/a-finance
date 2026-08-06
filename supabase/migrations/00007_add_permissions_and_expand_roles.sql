
-- Таблица разрешений сотрудников по страницам
CREATE TABLE IF NOT EXISTS employee_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  page text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(manager_id, page)
);

-- Таблица строк чистой прибыли (admin-only)
CREATE TABLE IF NOT EXISTS profit_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order int NOT NULL DEFAULT 0,
  label text NOT NULL DEFAULT '',
  formula text NOT NULL DEFAULT '',
  value numeric NOT NULL DEFAULT 0,
  is_auto boolean NOT NULL DEFAULT false,
  row_type text NOT NULL DEFAULT 'manual', -- 'manual' | 'revenue' | 'expenses' | 'salary'
  month_year text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: открытый доступ (как у остальных таблиц)
ALTER TABLE employee_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_rows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='employee_permissions' AND policyname='allow_all_employee_permissions'
  ) THEN
    CREATE POLICY allow_all_employee_permissions ON employee_permissions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='profit_rows' AND policyname='allow_all_profit_rows'
  ) THEN
    CREATE POLICY allow_all_profit_rows ON profit_rows FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
