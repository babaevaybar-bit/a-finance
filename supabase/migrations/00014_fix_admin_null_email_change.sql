
-- Исправляем NULL поля которые должны быть пустыми строками
UPDATE auth.users
SET
  email_change = COALESCE(email_change, ''),
  recovery_token = COALESCE(recovery_token, ''),
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email = 'admin@aybar.app'
  AND (
    email_change IS NULL
    OR recovery_token IS NULL
    OR confirmation_token IS NULL
  );
