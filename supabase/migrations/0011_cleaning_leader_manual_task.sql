-- =========================================================================
-- 清掃リーダーも「臨時の清掃を追加（手動）」できるようにする
--   症状: cleaning_tasks への insert は RLS で管理者（is_admin()）のみに限定されていたため、
--         アプリ側の権限チェック（assertAdmin → assertAdminOrCleaningLeader）を広げるだけでは
--         実際の insert が RLS で拒否されてしまう。
--   方針: is_admin() と同じ形の is_cleaning_leader()（SECURITY DEFINER）を追加し、
--         cleaning_tasks の insert ポリシーに「管理者 または 清掃リーダー」を許可する。
--         対象は insert のみ（update/delete の権限は変更しない。削除は管理者のみのまま）。
-- 適用: Supabase SQL Editor（0001〜0010 の後）
-- 既存 migration・既存データは変更しない。
-- =========================================================================

create or replace function public.is_cleaning_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.job_title = 'cleaning_leader' and u.active
  );
$$;

drop policy if exists cleaning_tasks_insert on public.cleaning_tasks;
create policy cleaning_tasks_insert on public.cleaning_tasks
  for insert with check (public.is_admin() or public.is_cleaning_leader());
