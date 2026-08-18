
ALTER TABLE employee_permissions
  ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN employee_permissions.can_approve IS 'Право подтверждать/отклонять сделки (старший менеджер)';
