ALTER TABLE salary_settings
  ADD COLUMN IF NOT EXISTS use_personal_revenue boolean NOT NULL DEFAULT true;