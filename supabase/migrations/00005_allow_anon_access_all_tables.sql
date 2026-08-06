-- Drop all existing restrictive policies and replace with open access
-- since auth is currently disabled (anon mode)

-- ── deals ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS deals_select ON deals;
DROP POLICY IF EXISTS deals_insert ON deals;
DROP POLICY IF EXISTS deals_update ON deals;
DROP POLICY IF EXISTS deals_delete ON deals;

CREATE POLICY deals_select ON deals FOR SELECT USING (true);
CREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (true);
CREATE POLICY deals_update ON deals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY deals_delete ON deals FOR DELETE USING (true);

-- ── managers ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS managers_select ON managers;
DROP POLICY IF EXISTS managers_insert ON managers;
DROP POLICY IF EXISTS managers_update ON managers;
DROP POLICY IF EXISTS managers_delete ON managers;

CREATE POLICY managers_select ON managers FOR SELECT USING (true);
CREATE POLICY managers_insert ON managers FOR INSERT WITH CHECK (true);
CREATE POLICY managers_update ON managers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY managers_delete ON managers FOR DELETE USING (true);

-- ── expenses ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS expenses_select ON expenses;
DROP POLICY IF EXISTS expenses_insert ON expenses;
DROP POLICY IF EXISTS expenses_update ON expenses;
DROP POLICY IF EXISTS expenses_delete ON expenses;

CREATE POLICY expenses_select ON expenses FOR SELECT USING (true);
CREATE POLICY expenses_insert ON expenses FOR INSERT WITH CHECK (true);
CREATE POLICY expenses_update ON expenses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY expenses_delete ON expenses FOR DELETE USING (true);

-- ── income ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS income_select ON income;
DROP POLICY IF EXISTS income_insert ON income;
DROP POLICY IF EXISTS income_update ON income;
DROP POLICY IF EXISTS income_delete ON income;

CREATE POLICY income_select ON income FOR SELECT USING (true);
CREATE POLICY income_insert ON income FOR INSERT WITH CHECK (true);
CREATE POLICY income_update ON income FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY income_delete ON income FOR DELETE USING (true);

-- ── transfers ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS transfers_select ON transfers;
DROP POLICY IF EXISTS transfers_insert ON transfers;
DROP POLICY IF EXISTS transfers_update ON transfers;
DROP POLICY IF EXISTS transfers_delete ON transfers;

CREATE POLICY transfers_select ON transfers FOR SELECT USING (true);
CREATE POLICY transfers_insert ON transfers FOR INSERT WITH CHECK (true);
CREATE POLICY transfers_update ON transfers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY transfers_delete ON transfers FOR DELETE USING (true);

-- ── sales_plans ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS plans_select ON sales_plans;
DROP POLICY IF EXISTS plans_insert ON sales_plans;
DROP POLICY IF EXISTS plans_update ON sales_plans;
DROP POLICY IF EXISTS plans_delete ON sales_plans;
DROP POLICY IF EXISTS sales_plans_all ON sales_plans;

CREATE POLICY sales_plans_select ON sales_plans FOR SELECT USING (true);
CREATE POLICY sales_plans_insert ON sales_plans FOR INSERT WITH CHECK (true);
CREATE POLICY sales_plans_update ON sales_plans FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY sales_plans_delete ON sales_plans FOR DELETE USING (true);

-- ── salary_settings ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS salary_all ON salary_settings;
DROP POLICY IF EXISTS salary_settings_select ON salary_settings;
DROP POLICY IF EXISTS salary_settings_insert ON salary_settings;
DROP POLICY IF EXISTS salary_settings_update ON salary_settings;
DROP POLICY IF EXISTS salary_settings_delete ON salary_settings;

CREATE POLICY salary_settings_select ON salary_settings FOR SELECT USING (true);
CREATE POLICY salary_settings_insert ON salary_settings FOR INSERT WITH CHECK (true);
CREATE POLICY salary_settings_update ON salary_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY salary_settings_delete ON salary_settings FOR DELETE USING (true);

-- ── profiles ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_insert_admin ON profiles;
DROP POLICY IF EXISTS profiles_update_admin ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;

CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY profiles_delete ON profiles FOR DELETE USING (true);