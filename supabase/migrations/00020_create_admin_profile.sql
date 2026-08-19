-- 00020_create_admin_profile.sql
--
-- Usage:
-- 1. Replace 'ADMIN_EMAIL' below with the admin user's email (the user must exist in auth.users).
-- 2. Run this SQL in Supabase Dashboard -> SQL Editor.
--
-- This will insert a profile for the given user id and set role = 'admin'.
-- If a profile already exists it will update the role to 'admin'.

-- Replace the email below before running
\set admin_email 'babaev.aybar@gmail.com'

WITH u AS (
  SELECT id FROM auth.users WHERE email = :admin_email
)
INSERT INTO public.profiles (id, name, role, manager_id, created_at, updated_at)
SELECT id, 'Admin', 'admin', NULL, NOW(), NOW() FROM u
ON CONFLICT (id) DO UPDATE
  SET role = 'admin', name = COALESCE(EXCLUDED.name, profiles.name), updated_at = NOW();

-- Verify by selecting the profile
SELECT * FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email = :admin_email);
