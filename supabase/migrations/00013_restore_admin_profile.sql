
-- Восстанавливаем профиль admin
INSERT INTO public.profiles (id, username, role, manager_id)
VALUES (
  '6e3b46ff-67d1-4ee0-9efd-82216161f957',
  'admin@aybar.app',
  'admin',
  NULL
)
ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username,
      role = EXCLUDED.role;

-- Удаляем тестовых пользователей probe2
DELETE FROM auth.users WHERE email = 'probe2@aybar.app';
