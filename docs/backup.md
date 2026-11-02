# Резервная копия базы

Каждую ночь в 03:00 (Шымкент) GitHub Actions запускает `.github/workflows/db-backup.yml`:
выгружает базу основного сайта, шифрует паролем `BACKUP_PASSPHRASE` и хранит 90 дней
(репозиторий → Actions → «Резервная копия базы» → нужный запуск → Artifacts).
Если копия не сделалась — GitHub присылает письмо владельцу репозитория.

## Что внутри
- `public.dump` — все таблицы сайта (структура + данные)
- `auth_users.dump` — учётные записи сотрудников
- `storage_meta.dump` — список загруженных файлов

## Восстановление (делает разработчик)
```bash
gpg --decrypt a-finance-YYYY-MM-DD_HHMM.tar.gz.gpg | tar -xzf -
# сначала — на тестовый проект, проверить; затем, если нужно, на основной
pg_restore --no-owner --no-privileges -d "$TEST_DB_URL" --clean --if-exists public.dump
# одна таблица/запись: pg_restore -t deals -f deals.sql public.dump и вставить нужные строки
```
