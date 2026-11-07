-- =========================================================================
-- 清掃リーダーも「清掃項目マスタ」に新規項目を追加できるようにする
--   症状: cleaning_master / cleaning_schedules への insert/update/delete は
--         まとめて 1 本の for all ポリシー（{table}_write、is_admin() のみ）で
--         管理されていたため、新規追加だけを清掃リーダーに許可することができない。
--   方針: cleaning_tasks と同様に insert / update / delete を別ポリシーに分割する。
--         insert のみ「管理者 または 清掃リーダー」に許可（is_cleaning_leader() は
--         0011 で作成済みのものをそのまま再利用）。update・delete は従来どおり
--         管理者限定のまま（既存項目の編集・無効化・削除は対象外）。
-- 適用: Supabase SQL Editor（0001〜0011 の後）
-- 既存 migration・既存データは変更しない。
-- =========================================================================

drop policy if exists cleaning_master_write on public.cleaning_master;
drop policy if exists cleaning_master_insert on public.cleaning_master;
create policy cleaning_master_insert on public.cleaning_master
  for insert with check (public.is_admin() or public.is_cleaning_leader());

drop policy if exists cleaning_master_update on public.cleaning_master;
create policy cleaning_master_update on public.cleaning_master
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists cleaning_master_delete on public.cleaning_master;
create policy cleaning_master_delete on public.cleaning_master
  for delete using (public.is_admin());

drop policy if exists cleaning_schedules_write on public.cleaning_schedules;
drop policy if exists cleaning_schedules_insert on public.cleaning_schedules;
create policy cleaning_schedules_insert on public.cleaning_schedules
  for insert with check (public.is_admin() or public.is_cleaning_leader());

drop policy if exists cleaning_schedules_update on public.cleaning_schedules;
create policy cleaning_schedules_update on public.cleaning_schedules
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists cleaning_schedules_delete on public.cleaning_schedules;
create policy cleaning_schedules_delete on public.cleaning_schedules
  for delete using (public.is_admin());
