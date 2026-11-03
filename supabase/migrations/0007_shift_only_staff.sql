-- =========================================================================
-- シフトのみのスタッフ（アプリのログイン・LINE通知は使わない）
--   LINE通知を受け取るのは店長・管理者・ホールリーダー・清掃リーダーなど数名のみで、
--   一般スタッフの大半はアプリアカウント（auth.users）を持たない。
--   しかしシフトCSVには全スタッフの氏名・ホール/キッチン担当が載っているため、
--   ログインアカウントを作らずに daily_staffing / cleaning_tasks.assignee_id へ
--   登録できるようにする（users.id は auth.users がある前提だった制約を緩和）。
-- 適用: Supabase SQL Editor（0001〜0006 の後）
-- 既存 migration は変更しない。既存データは削除しない（列追加・制約緩和のみ）。
-- =========================================================================

-- ---- users.id を auth.users への外部キーから解放 ----
-- ログインアカウントを持つスタッフは今まで通り auth.users と同じ id を使う
-- （サインアップ時のトリガーは変更なし）。一方でシフトCSV専用スタッフは
-- auth.users に対応行が無い id を発行するため、この FK があると挿入できない。
alter table public.users drop constraint if exists users_id_fkey;

-- ---- has_login: ログイン可能な実アカウントか、シフト連携のみの登録か ----
-- 既存行はすべて実アカウントなので既定 true。シフト取込で新規作成する行のみ false。
alter table public.users
  add column if not exists has_login boolean not null default true;

-- ---- auth.users 削除時の public.users 削除を FK cascade の代わりにトリガーで維持 ----
-- （上で FK を外したため、実アカウント側の「認証ユーザーを消したらプロフィールも消える」
--   という既存の挙動をトリガーで明示的に肩代わりする。シフト専用行は auth.users に
--   対応行が無いためこのトリガーの影響を受けない）
create or replace function public.handle_deleted_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.users where id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_auth_user_deleted on auth.users;
create trigger trg_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_auth_user();
