
-- Вставляем identity записи для всех пользователей у которых их нет
-- email — это generated column, не вставляем его явно
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub',   u.id::text,
    'email', u.email
  ),
  'email',
  u.created_at,
  u.updated_at
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i
  WHERE i.user_id = u.id AND i.provider = 'email'
)
AND u.email IS NOT NULL;
