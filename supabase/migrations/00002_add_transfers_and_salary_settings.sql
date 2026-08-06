
-- Transfers between own accounts (excluded from profit/expense calculations)
CREATE TABLE IF NOT EXISTS transfers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  from_channel text NOT NULL,
  to_channel   text NOT NULL,
  amount       numeric(14,2) NOT NULL CHECK (amount > 0),
  comment      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_all" ON transfers FOR ALL USING (true) WITH CHECK (true);

-- Salary settings per manager
CREATE TABLE IF NOT EXISTS salary_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id      uuid NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  base_salary     numeric(14,2) NOT NULL DEFAULT 0,
  commission_pct  numeric(5,2)  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manager_id)
);
ALTER TABLE salary_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salary_all" ON salary_settings FOR ALL USING (true) WITH CHECK (true);
