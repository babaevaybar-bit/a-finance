
-- Add comment and salary_amount to deals
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS comment       text,
  ADD COLUMN IF NOT EXISTS salary_amount numeric(14,2);

-- Add role to managers (default = 'Менеджер')
ALTER TABLE managers
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'Менеджер';
