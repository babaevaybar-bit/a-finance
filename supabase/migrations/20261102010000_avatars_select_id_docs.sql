-- 1) Фото профиля не загружалось: загрузка в хранилище возвращает созданную строку,
--    а без права SELECT на свою папку RLS отклоняет вставку («new row violates row-level security policy»).
drop policy if exists "avatars own select" on storage.objects;
create policy "avatars own select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Удостоверение личности сотрудника: закрытое хранилище, папка = id сотрудника (managers.id).
--    Видят и меняют только сам сотрудник и Главный админ.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-docs', 'id-docs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.id_docs_access(p_folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'director')
      or (p_folder is not null and p_folder = my_manager_id()::text);
$$;
revoke all on function public.id_docs_access(text) from public, anon;
grant execute on function public.id_docs_access(text) to authenticated;

drop policy if exists id_docs_select on storage.objects;
drop policy if exists id_docs_insert on storage.objects;
drop policy if exists id_docs_update on storage.objects;
drop policy if exists id_docs_delete on storage.objects;
create policy id_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'id-docs' and public.id_docs_access((storage.foldername(name))[1]));
create policy id_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'id-docs' and public.id_docs_access((storage.foldername(name))[1]));
create policy id_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'id-docs' and public.id_docs_access((storage.foldername(name))[1]));
create policy id_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'id-docs' and public.id_docs_access((storage.foldername(name))[1]));
