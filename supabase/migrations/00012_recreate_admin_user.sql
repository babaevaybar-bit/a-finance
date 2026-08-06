
-- Удаляем старую identity запись admin
DELETE FROM auth.identities
WHERE user_id = '6e3b46ff-67d1-4ee0-9efd-82216161f957';

-- Удаляем старого admin пользователя
DELETE FROM auth.users
WHERE id = '6e3b46ff-67d1-4ee0-9efd-82216161f957';

-- Пересоздаём admin с правильной структурой данных
-- как это делает GoTrue v2.195+
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  is_anonymous,
  is_sso_user,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  reauthentication_token,
  email_change_confirm_status
)
VALUES (
  '6e3b46ff-67d1-4ee0-9efd-82216161f957',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@aybar.app',
  '$2a$10$6za.EVWQjrhVKmzjTer.i.EFsuT1lmVF/cntXOlfzuo3v3f9N2gu.',
  now(),
  NULL,
  '{"provider":"email","providers":["email"]}',
  '{"sub":"6e3b46ff-67d1-4ee0-9efd-82216161f957","email":"admin@aybar.app","email_verified":true,"phone_verified":false}',
  false,
  false,
  false,
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  0
);

-- Пересоздаём identity запись в правильном формате GoTrue v2.195+
INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
VALUES (
  '6e3b46ff-67d1-4ee0-9efd-82216161f957',
  '6e3b46ff-67d1-4ee0-9efd-82216161f957',
  '{"sub":"6e3b46ff-67d1-4ee0-9efd-82216161f957","email":"admin@aybar.app","email_verified":true,"phone_verified":false}',
  'email',
  now(),
  now()
);
