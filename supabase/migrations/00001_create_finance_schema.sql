
-- =============================================
-- MANAGERS table
-- =============================================
CREATE TABLE managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers_all" ON managers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Seed initial managers from the xlsx
INSERT INTO managers (name) VALUES ('Айбар'), ('Салтанат'), ('Мухаммед');

-- =============================================
-- SALES_PLANS table (per manager per month)
-- =============================================
CREATE TABLE sales_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  month_year text NOT NULL,  -- format: YYYY-MM
  plan_amount numeric(18,2) NOT NULL DEFAULT 0,
  net_profit_plan numeric(18,2),
  dividends_plan numeric(18,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(manager_id, month_year)
);

ALTER TABLE sales_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_plans_all" ON sales_plans FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =============================================
-- DEALS table
-- =============================================
CREATE TABLE deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  month_year text NOT NULL,  -- format: YYYY-MM
  deal_date date NOT NULL,
  client_phone text,
  address text,
  client_name text,
  payment_method text NOT NULL DEFAULT 'Каспи',  -- Каспи / Халык / Freedom / Наличные / Каспи и нал / Другое
  door_model text,
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount numeric(18,2) NOT NULL DEFAULT 0,
  prepayment_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deals_all" ON deals FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =============================================
-- EXPENSES table
-- =============================================
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  channel text NOT NULL DEFAULT 'Каспи',  -- Каспи / Халык / Фридом / Наличные
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_all" ON expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =============================================
-- INCOME table (поступления)
-- =============================================
CREATE TABLE income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id uuid REFERENCES managers(id) ON DELETE SET NULL,
  income_date date NOT NULL,
  from_whom text NOT NULL DEFAULT '',
  total_amount numeric(18,2) NOT NULL DEFAULT 0,
  quantity integer,
  channel text NOT NULL DEFAULT 'Каспи',  -- Каспи / Халык / Фридом / Наличные
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "income_all" ON income FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
