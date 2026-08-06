
-- Обновляем identity_data для всех старых пользователей — добавляем обязательные поля
-- которые GoTrue v2.195+ требует при signIn: email_verified, phone_verified
UPDATE auth.identities
SET identity_data = identity_data
  || jsonb_build_object(
    'email_verified', (
      SELECT (email_confirmed_at IS NOT NULL)
      FROM auth.users u
      WHERE u.id = auth.identities.user_id
    ),
    'phone_verified', false
  )
WHERE provider = 'email'
  AND (
    identity_data->>'email_verified' IS NULL
    OR identity_data->>'phone_verified' IS NULL
  );
