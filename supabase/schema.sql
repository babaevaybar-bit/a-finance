-- ============================================================
-- SECTION: SCHEMA
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


--
-- Name: EXTENSION "supabase_vault"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "supabase_vault" IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;


--
-- Name: my_manager_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."my_manager_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT manager_id FROM profiles WHERE id = auth.uid();
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: client_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."client_change_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "changed_by" "uuid",
    "field_name" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: client_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."client_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "interaction_type" "text" DEFAULT 'comment'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "interacted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: client_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."client_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "manager_id" "uuid",
    "client_name" "text" NOT NULL,
    "client_phone" "text",
    "client_quality" "text" DEFAULT 'cold'::"text" NOT NULL,
    "address" "text",
    "property_type" "text",
    "area_sqm" numeric(10,2),
    "budget" numeric(15,2),
    "source" "text",
    "contact_type" "text",
    "deal_stage" "text" DEFAULT 'new'::"text",
    "next_action" "text",
    "next_action_date" "date",
    "is_deal_closed" boolean DEFAULT false NOT NULL,
    "deal_amount" numeric(15,2) DEFAULT 0,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "lead_source" "text" DEFAULT 'other'::"text"
);


--
-- Name: client_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."client_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "title" "text" NOT NULL,
    "due_date" "date",
    "is_done" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: daily_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."daily_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "channel" "text" NOT NULL,
    "new_clients" integer DEFAULT 0 NOT NULL,
    "leads" integer DEFAULT 0 NOT NULL,
    "closed_deals" integer DEFAULT 0 NOT NULL,
    "sales_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "ad_cost" numeric(15,2) DEFAULT 0 NOT NULL,
    "comment" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "month_year" "text" NOT NULL,
    "deal_date" "date" NOT NULL,
    "client_phone" "text",
    "address" "text",
    "client_name" "text",
    "payment_method" "text" DEFAULT 'Каспи'::"text" NOT NULL,
    "door_model" "text",
    "total_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "paid_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "prepayment_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "comment" "text",
    "salary_amount" numeric(14,2),
    "status" "text" DEFAULT 'approved'::"text" NOT NULL
);


--
-- Name: employee_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."employee_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "page" "text" NOT NULL,
    "can_view" boolean DEFAULT true NOT NULL,
    "can_edit" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_approve" boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN "employee_permissions"."can_approve"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."employee_permissions"."can_approve" IS 'Право подтверждать/отклонять сделки (старший менеджер)';


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_date" "date" NOT NULL,
    "amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "channel" "text" DEFAULT 'Каспи'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: income; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."income" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manager_id" "uuid",
    "income_date" "date" NOT NULL,
    "from_whom" "text" DEFAULT ''::"text" NOT NULL,
    "total_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "quantity" integer,
    "channel" "text" DEFAULT 'Каспи'::"text" NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: managers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."managers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'Менеджер'::"text" NOT NULL,
    "user_id" "uuid"
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "manager_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: profit_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."profit_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "formula" "text" DEFAULT ''::"text" NOT NULL,
    "value" numeric DEFAULT 0 NOT NULL,
    "is_auto" boolean DEFAULT false NOT NULL,
    "row_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "month_year" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "row_type_v2" "text",
    "percent" numeric(8,4) DEFAULT 0
);


--
-- Name: salary_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."salary_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "base_salary" numeric(14,2) DEFAULT 0 NOT NULL,
    "commission_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "use_personal_revenue" boolean DEFAULT true NOT NULL
);


--
-- Name: sales_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."sales_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "manager_id" "uuid" NOT NULL,
    "month_year" "text" NOT NULL,
    "plan_amount" numeric(18,2) DEFAULT 0 NOT NULL,
    "net_profit_plan" numeric(18,2),
    "dividends_plan" numeric(18,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS "public"."transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transfer_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "from_channel" "text" NOT NULL,
    "to_channel" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transfers_amount_check" CHECK (("amount" > (0)::numeric))
);


--
-- Name: client_change_log client_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_change_log_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_change_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_change_log"
    ADD CONSTRAINT "client_change_log_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_interactions client_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_interactions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_interactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_interactions"
    ADD CONSTRAINT "client_interactions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_reports client_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_reports_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_reports'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_reports"
    ADD CONSTRAINT "client_reports_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_tasks client_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_tasks_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: daily_reports daily_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'daily_reports_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'daily_reports'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'deals_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'deals'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: employee_permissions employee_permissions_manager_id_page_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'employee_permissions_manager_id_page_key'
      AND n.nspname = 'public'
      AND c.relname = 'employee_permissions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."employee_permissions"
    ADD CONSTRAINT "employee_permissions_manager_id_page_key" UNIQUE ("manager_id", "page");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: employee_permissions employee_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'employee_permissions_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'employee_permissions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."employee_permissions"
    ADD CONSTRAINT "employee_permissions_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'expenses_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: income income_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'income_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'income'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."income"
    ADD CONSTRAINT "income_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: managers managers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'managers_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'managers'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."managers"
    ADD CONSTRAINT "managers_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_username_key'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profit_rows profit_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profit_rows_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'profit_rows'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profit_rows"
    ADD CONSTRAINT "profit_rows_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: salary_settings salary_settings_manager_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'salary_settings_manager_id_key'
      AND n.nspname = 'public'
      AND c.relname = 'salary_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."salary_settings"
    ADD CONSTRAINT "salary_settings_manager_id_key" UNIQUE ("manager_id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: salary_settings salary_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'salary_settings_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'salary_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."salary_settings"
    ADD CONSTRAINT "salary_settings_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sales_plans sales_plans_manager_id_month_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'sales_plans_manager_id_month_year_key'
      AND n.nspname = 'public'
      AND c.relname = 'sales_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."sales_plans"
    ADD CONSTRAINT "sales_plans_manager_id_month_year_key" UNIQUE ("manager_id", "month_year");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sales_plans sales_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'sales_plans_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'sales_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."sales_plans"
    ADD CONSTRAINT "sales_plans_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfers transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'transfers_pkey'
      AND n.nspname = 'public'
      AND c.relname = 'transfers'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_pkey" PRIMARY KEY ("id");
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: ccl_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "ccl_client_idx" ON "public"."client_change_log" USING "btree" ("client_id");


--
-- Name: ci_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "ci_client_idx" ON "public"."client_interactions" USING "btree" ("client_id");


--
-- Name: client_reports_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "client_reports_date_idx" ON "public"."client_reports" USING "btree" ("report_date");


--
-- Name: client_reports_manager_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "client_reports_manager_idx" ON "public"."client_reports" USING "btree" ("manager_id");


--
-- Name: client_reports_quality_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "client_reports_quality_idx" ON "public"."client_reports" USING "btree" ("client_quality");


--
-- Name: client_reports_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "client_reports_stage_idx" ON "public"."client_reports" USING "btree" ("deal_stage");


--
-- Name: ct_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "ct_client_idx" ON "public"."client_tasks" USING "btree" ("client_id");


--
-- Name: ct_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "ct_due_idx" ON "public"."client_tasks" USING "btree" ("due_date");


--
-- Name: daily_reports_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "daily_reports_channel_idx" ON "public"."daily_reports" USING "btree" ("channel");


--
-- Name: daily_reports_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "daily_reports_date_idx" ON "public"."daily_reports" USING "btree" ("report_date");


--
-- Name: managers_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS "managers_user_id_idx" ON "public"."managers" USING "btree" ("user_id");


--
-- Name: client_change_log client_change_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_change_log_changed_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_change_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_change_log"
    ADD CONSTRAINT "client_change_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_change_log client_change_log_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_change_log_client_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_change_log'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_change_log"
    ADD CONSTRAINT "client_change_log_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."client_reports"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_interactions client_interactions_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_interactions_author_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_interactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_interactions"
    ADD CONSTRAINT "client_interactions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_interactions client_interactions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_interactions_client_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_interactions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_interactions"
    ADD CONSTRAINT "client_interactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."client_reports"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_reports client_reports_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_reports_manager_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_reports'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_reports"
    ADD CONSTRAINT "client_reports_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_tasks client_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_tasks_assigned_to_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_tasks client_tasks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'client_tasks_client_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'client_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."client_reports"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: daily_reports daily_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'daily_reports_created_by_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'daily_reports'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: deals deals_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'deals_manager_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'deals'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: employee_permissions employee_permissions_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'employee_permissions_manager_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'employee_permissions'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."employee_permissions"
    ADD CONSTRAINT "employee_permissions_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: income income_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'income_manager_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'income'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."income"
    ADD CONSTRAINT "income_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: managers managers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'managers_user_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'managers'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."managers"
    ADD CONSTRAINT "managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'profiles_manager_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE SET NULL;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: salary_settings salary_settings_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'salary_settings_manager_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'salary_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."salary_settings"
    ADD CONSTRAINT "salary_settings_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sales_plans sales_plans_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.conname = 'sales_plans_manager_id_fkey'
      AND n.nspname = 'public'
      AND c.relname = 'sales_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
ALTER TABLE ONLY "public"."sales_plans"
    ADD CONSTRAINT "sales_plans_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE CASCADE;
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: employee_permissions allow_all_employee_permissions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'allow_all_employee_permissions'
      AND n.nspname = 'public'
      AND c.relname = 'employee_permissions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "allow_all_employee_permissions" ON "public"."employee_permissions" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profit_rows allow_all_profit_rows; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'allow_all_profit_rows'
      AND n.nspname = 'public'
      AND c.relname = 'profit_rows'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "allow_all_profit_rows" ON "public"."profit_rows" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_change_log auth_all_changelog; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_all_changelog'
      AND n.nspname = 'public'
      AND c.relname = 'client_change_log'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "auth_all_changelog" ON "public"."client_change_log" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_reports auth_all_client_reports; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_all_client_reports'
      AND n.nspname = 'public'
      AND c.relname = 'client_reports'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "auth_all_client_reports" ON "public"."client_reports" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: daily_reports auth_all_daily_reports; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_all_daily_reports'
      AND n.nspname = 'public'
      AND c.relname = 'daily_reports'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "auth_all_daily_reports" ON "public"."daily_reports" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_interactions auth_all_interactions; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_all_interactions'
      AND n.nspname = 'public'
      AND c.relname = 'client_interactions'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "auth_all_interactions" ON "public"."client_interactions" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_tasks auth_all_tasks; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'auth_all_tasks'
      AND n.nspname = 'public'
      AND c.relname = 'client_tasks'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "auth_all_tasks" ON "public"."client_tasks" TO "authenticated" USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: client_change_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_change_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_interactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."daily_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;

--
-- Name: deals deals_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'deals_delete'
      AND n.nspname = 'public'
      AND c.relname = 'deals'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "deals_delete" ON "public"."deals" FOR DELETE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: deals deals_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'deals_insert'
      AND n.nspname = 'public'
      AND c.relname = 'deals'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "deals_insert" ON "public"."deals" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: deals deals_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'deals_select'
      AND n.nspname = 'public'
      AND c.relname = 'deals'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "deals_select" ON "public"."deals" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: deals deals_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'deals_update'
      AND n.nspname = 'public'
      AND c.relname = 'deals'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "deals_update" ON "public"."deals" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: employee_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."employee_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'expenses_delete'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "expenses_delete" ON "public"."expenses" FOR DELETE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses expenses_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'expenses_insert'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "expenses_insert" ON "public"."expenses" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses expenses_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'expenses_select'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "expenses_select" ON "public"."expenses" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: expenses expenses_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'expenses_update'
      AND n.nspname = 'public'
      AND c.relname = 'expenses'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "expenses_update" ON "public"."expenses" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: income; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."income" ENABLE ROW LEVEL SECURITY;

--
-- Name: income income_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'income_delete'
      AND n.nspname = 'public'
      AND c.relname = 'income'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "income_delete" ON "public"."income" FOR DELETE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: income income_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'income_insert'
      AND n.nspname = 'public'
      AND c.relname = 'income'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "income_insert" ON "public"."income" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: income income_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'income_select'
      AND n.nspname = 'public'
      AND c.relname = 'income'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "income_select" ON "public"."income" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: income income_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'income_update'
      AND n.nspname = 'public'
      AND c.relname = 'income'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "income_update" ON "public"."income" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: managers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."managers" ENABLE ROW LEVEL SECURITY;

--
-- Name: managers managers_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'managers_delete'
      AND n.nspname = 'public'
      AND c.relname = 'managers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "managers_delete" ON "public"."managers" FOR DELETE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: managers managers_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'managers_insert'
      AND n.nspname = 'public'
      AND c.relname = 'managers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "managers_insert" ON "public"."managers" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: managers managers_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'managers_select'
      AND n.nspname = 'public'
      AND c.relname = 'managers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "managers_select" ON "public"."managers" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: managers managers_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'managers_update'
      AND n.nspname = 'public'
      AND c.relname = 'managers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "managers_update" ON "public"."managers" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'profiles_delete'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "profiles_delete" ON "public"."profiles" FOR DELETE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'profiles_insert'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'profiles_select'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'profiles_update'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: profit_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profit_rows" ENABLE ROW LEVEL SECURITY;

--
-- Name: salary_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."salary_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: salary_settings salary_settings_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'salary_settings_delete'
      AND n.nspname = 'public'
      AND c.relname = 'salary_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "salary_settings_delete" ON "public"."salary_settings" FOR DELETE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: salary_settings salary_settings_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'salary_settings_insert'
      AND n.nspname = 'public'
      AND c.relname = 'salary_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "salary_settings_insert" ON "public"."salary_settings" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: salary_settings salary_settings_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'salary_settings_select'
      AND n.nspname = 'public'
      AND c.relname = 'salary_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "salary_settings_select" ON "public"."salary_settings" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: salary_settings salary_settings_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'salary_settings_update'
      AND n.nspname = 'public'
      AND c.relname = 'salary_settings'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "salary_settings_update" ON "public"."salary_settings" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sales_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sales_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_plans sales_plans_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'sales_plans_delete'
      AND n.nspname = 'public'
      AND c.relname = 'sales_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "sales_plans_delete" ON "public"."sales_plans" FOR DELETE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sales_plans sales_plans_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'sales_plans_insert'
      AND n.nspname = 'public'
      AND c.relname = 'sales_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "sales_plans_insert" ON "public"."sales_plans" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sales_plans sales_plans_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'sales_plans_select'
      AND n.nspname = 'public'
      AND c.relname = 'sales_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "sales_plans_select" ON "public"."sales_plans" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: sales_plans sales_plans_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'sales_plans_update'
      AND n.nspname = 'public'
      AND c.relname = 'sales_plans'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "sales_plans_update" ON "public"."sales_plans" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."transfers" ENABLE ROW LEVEL SECURITY;

--
-- Name: transfers transfers_delete; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'transfers_delete'
      AND n.nspname = 'public'
      AND c.relname = 'transfers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "transfers_delete" ON "public"."transfers" FOR DELETE USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfers transfers_insert; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'transfers_insert'
      AND n.nspname = 'public'
      AND c.relname = 'transfers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "transfers_insert" ON "public"."transfers" FOR INSERT WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfers transfers_select; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'transfers_select'
      AND n.nspname = 'public'
      AND c.relname = 'transfers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "transfers_select" ON "public"."transfers" FOR SELECT USING (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- Name: transfers transfers_update; Type: POLICY; Schema: public; Owner: -
--

DO $pg_schema_restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pol.polname = 'transfers_update'
      AND n.nspname = 'public'
      AND c.relname = 'transfers'
  ) THEN
    EXECUTE $pg_schema_sql$
CREATE POLICY "transfers_update" ON "public"."transfers" FOR UPDATE USING (true) WITH CHECK (true);
$pg_schema_sql$;
  END IF;
END
$pg_schema_restore$;


--
-- PostgreSQL database dump complete
--




-- ============================================================
-- SECTION: DIFF FILTER OBJECTS
-- ============================================================
-- Objects that match diff-filter.json but cannot be represented
-- precisely by pg_dump --filter.


-- ============================================================
-- SECTION: STORAGE BUCKETS DATA
-- ============================================================


-- ============================================================
-- SECTION: CRON JOBS
-- ============================================================
-- 用户自定义 pg_cron 任务。

