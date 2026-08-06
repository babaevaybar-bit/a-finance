
-- Синхронизируем identity_data с raw_user_meta_data для всех пользователей
-- GoTrue v2.195+ требует консистентности между этими двумя полями
-- Обновляем identity_data: email_verified берём из raw_user_meta_data
UPDATE auth.identities i
SET identity_data = jsonb_build_object(
  'sub',            u.id::text,
  'email',          u.email,
  'email_verified', (u.raw_user_meta_data->>'email_verified')::boolean,
  'phone_verified', false
)
FROM auth.users u
WHERE i.user_id = u.id
  AND i.provider = 'email'
  AND u.raw_user_meta_data->>'email_verified' IS NOT NULL;
