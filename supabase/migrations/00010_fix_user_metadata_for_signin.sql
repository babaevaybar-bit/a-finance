
-- Заполняем raw_user_meta_data для всех пользователей у кого он пустой
-- GoTrue v2.195+ ожидает эти поля при signIn
UPDATE auth.users
SET raw_user_meta_data = jsonb_build_object(
  'sub',            id::text,
  'email',          email,
  'email_verified', (email_confirmed_at IS NOT NULL),
  'phone_verified', false
)
WHERE (raw_user_meta_data IS NULL OR raw_user_meta_data = '{}'::jsonb)
  AND email IS NOT NULL;
