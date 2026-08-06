-- 1. Add deal status (pending/approved/rejected)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

-- 2. Add user_id to managers (links to auth.users)
ALTER TABLE managers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS managers_user_id_idx ON managers(user_id);

-- 3. Profiles table (role = 'admin' | 'employee')
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  manager_id uuid REFERENCES managers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admin can update any profile
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  USING (is_admin());

CREATE POLICY "profiles_insert_admin" ON profiles FOR INSERT
  WITH CHECK (is_admin() OR auth.uid() = id);

-- 4. RLS for deals: employees can only see/edit their own manager's deals
-- Drop old permissive policies if any
DROP POLICY IF EXISTS "deals_all" ON deals;
DROP POLICY IF EXISTS "deals_select_all" ON deals;
DROP POLICY IF EXISTS "deals_insert_all" ON deals;
DROP POLICY IF EXISTS "deals_update_all" ON deals;
DROP POLICY IF EXISTS "deals_delete_all" ON deals;

-- Helper: get manager_id for current user
CREATE OR REPLACE FUNCTION my_manager_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT manager_id FROM profiles WHERE id = auth.uid();
$$;

CREATE POLICY "deals_select" ON deals FOR SELECT USING (
  is_admin() OR manager_id = my_manager_id()
);
CREATE POLICY "deals_insert" ON deals FOR INSERT WITH CHECK (
  is_admin() OR manager_id = my_manager_id()
);
CREATE POLICY "deals_update" ON deals FOR UPDATE USING (
  is_admin() OR (manager_id = my_manager_id() AND status = 'pending')
);
CREATE POLICY "deals_delete" ON deals FOR DELETE USING (
  is_admin() OR (manager_id = my_manager_id() AND status = 'pending')
);

-- 5. All other tables: admin full, employees read-only (existing tables already have RLS disabled per history; add it now)
-- managers
DROP POLICY IF EXISTS "managers_all" ON managers;
CREATE POLICY "managers_select" ON managers FOR SELECT USING (true);
CREATE POLICY "managers_insert" ON managers FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "managers_update" ON managers FOR UPDATE USING (is_admin());
CREATE POLICY "managers_delete" ON managers FOR DELETE USING (is_admin());

-- sales_plans
DROP POLICY IF EXISTS "plans_all" ON sales_plans;
CREATE POLICY "plans_select" ON sales_plans FOR SELECT USING (true);
CREATE POLICY "plans_insert" ON sales_plans FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "plans_update" ON sales_plans FOR UPDATE USING (is_admin());
CREATE POLICY "plans_delete" ON sales_plans FOR DELETE USING (is_admin());

-- expenses
DROP POLICY IF EXISTS "expenses_all" ON expenses;
CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (is_admin());
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (is_admin());
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (is_admin());

-- income
DROP POLICY IF EXISTS "income_all" ON income;
CREATE POLICY "income_select" ON income FOR SELECT USING (is_admin());
CREATE POLICY "income_insert" ON income FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "income_update" ON income FOR UPDATE USING (is_admin());
CREATE POLICY "income_delete" ON income FOR DELETE USING (is_admin());

-- transfers
DROP POLICY IF EXISTS "transfers_all" ON transfers;
CREATE POLICY "transfers_select" ON transfers FOR SELECT USING (is_admin());
CREATE POLICY "transfers_insert" ON transfers FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "transfers_update" ON transfers FOR UPDATE USING (is_admin());
CREATE POLICY "transfers_delete" ON transfers FOR DELETE USING (is_admin());

-- salary_settings
DROP POLICY IF EXISTS "salary_settings_all" ON salary_settings;
CREATE POLICY "salary_settings_select" ON salary_settings FOR SELECT USING (true);
CREATE POLICY "salary_settings_insert" ON salary_settings FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "salary_settings_update" ON salary_settings FOR UPDATE USING (is_admin());
CREATE POLICY "salary_settings_delete" ON salary_settings FOR DELETE USING (is_admin());