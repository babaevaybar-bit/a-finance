
-- Исправляем NULL string-поля для ВСЕХ пользователей
UPDATE auth.users
SET
  email_change            = COALESCE(email_change, ''),
  recovery_token          = COALESCE(recovery_token, ''),
  confirmation_token      = COALESCE(confirmation_token, ''),
  email_change_token_new  = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change            = COALESCE(phone_change, ''),
  phone_change_token      = COALESCE(phone_change_token, ''),
  reauthentication_token  = COALESCE(reauthentication_token, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0)
WHERE email_change IS NULL
   OR recovery_token IS NULL
   OR confirmation_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;

-- Обновляем пароли для всех пользователей на Admin123!
-- (bcrypt хэш Admin123! с cost=10)
UPDATE auth.users
SET encrypted_password = '$2a$10$6za.EVWQjrhVKmzjTer.i.EFsuT1lmVF/cntXOlfzuo3v3f9N2gu.'
WHERE email IN ('abil@aybar.app', 'abil1@aybar.app', 'manager3@aybar.app', 'test.new@aybar.app');
