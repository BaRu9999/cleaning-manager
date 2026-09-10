-- =========================================================================
-- 清掃写真用の Storage バケットと RLS ポリシー
-- 適用: Supabase SQL Editor に貼り付け（0001 の後）
--
-- バケット 'cleaning-photos' は非公開。閲覧は署名付きURL経由（サーバーで発行）。
-- パス設計: <task_date>/<task_id>/<uuid>.<ext>   例: 2026-09-10/<uuid>/<uuid>.jpg
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cleaning-photos', 'cleaning-photos', false,
  10485760,  -- 10 MiB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 参照: 在籍メンバーのみ（署名付きURL発行はサーバーの service_role でも可）
drop policy if exists cleaning_photos_read on storage.objects;
create policy cleaning_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'cleaning-photos' and public.is_active_member());

-- アップロード: 在籍メンバーのみ
drop policy if exists cleaning_photos_upload on storage.objects;
create policy cleaning_photos_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cleaning-photos' and public.is_active_member());

-- 更新（upsert 時のメタ更新など）: アップロード者本人
drop policy if exists cleaning_photos_modify on storage.objects;
create policy cleaning_photos_modify on storage.objects
  for update to authenticated
  using (bucket_id = 'cleaning-photos' and owner = auth.uid())
  with check (bucket_id = 'cleaning-photos' and owner = auth.uid());

-- 削除: 管理者、またはアップロード者本人
drop policy if exists cleaning_photos_remove on storage.objects;
create policy cleaning_photos_remove on storage.objects
  for delete to authenticated
  using (bucket_id = 'cleaning-photos' and (public.is_admin() or owner = auth.uid()));
