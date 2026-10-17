-- =========================================================================
-- 役職（job_title）・カテゴリー区分・LINE 通知設定
-- 適用: Supabase SQL Editor（0001 / 0002 の後 → その後 0004）
--
-- ・users に job_title（一般スタッフ / 清掃リーダー / ホールリーダー / 店長）と
--   閲覧可能カテゴリーを追加（LINE 通知の「内容の出し分け」に使う）
-- ・cleaning_categories に side（hall / kitchen / backyard / other）
-- ・notification_settings に LINE 通知の設定項目
--
-- 既存 users.role（admin / staff = 権限）は不変。job_title は通知・閲覧範囲の軸。
-- LINE アカウントの紐付けは 0004 の staff_line_accounts（別テーブル）で管理する。
-- =========================================================================

-- ---- users: 役職 / 閲覧カテゴリー ----
alter table public.users
  add column if not exists job_title text not null default 'staff'
    check (job_title in ('staff','cleaning_leader','hall_leader','manager')),
  add column if not exists staff_code text unique,               -- 管理者発行のスタッフコード（LIFF 登録の代替手段）
  -- null = 全カテゴリー閲覧可 / 配列 = その範囲に限定（ホールリーダー等）
  add column if not exists visible_category_ids uuid[];

create index if not exists users_job_title_idx on public.users (job_title) where active;

-- ---- cleaning_categories: side ----
alter table public.cleaning_categories
  add column if not exists side text not null default 'other'
    check (side in ('hall','kitchen','backyard','other'));

update public.cleaning_categories set side = 'hall'     where name = 'ホール'       and side = 'other';
update public.cleaning_categories set side = 'kitchen'  where name = 'キッチン'     and side = 'other';
update public.cleaning_categories set side = 'backyard' where name = 'バックヤード' and side = 'other';

-- ---- notification_settings: LINE 設定 ----
alter table public.notification_settings
  add column if not exists line_enabled boolean not null default false,
  -- env（LINE_CHANNEL_*）を優先し、無ければここをフォールバック
  add column if not exists line_channel_access_token text,
  add column if not exists line_channel_secret text,
  -- 朝の清掃予定通知の時刻
  add column if not exists line_morning_time text not null default '09:30',
  -- 途中進捗通知の時刻（"HH:MM" の配列。複数可）
  add column if not exists line_progress_times jsonb not null default '["17:00"]'::jsonb,
  -- 未実施通知（期限前リマインド）の分オフセット。負=前 / 0=時刻 / 正=後
  add column if not exists line_reminder_offsets jsonb not null default '[-30]'::jsonb,
  -- 閉店後レポートの時刻
  add column if not exists line_closing_time text not null default '23:00',
  -- 役職 × 通知種別（morning / progress / pending / overdue / closing）の受信可否
  add column if not exists line_role_prefs jsonb not null default '{
    "staff":          {"morning": true,  "progress": false, "pending": true,  "overdue": true,  "closing": false},
    "cleaning_leader":{"morning": true,  "progress": true,  "pending": true,  "overdue": true,  "closing": true},
    "hall_leader":    {"morning": true,  "progress": false, "pending": true,  "overdue": true,  "closing": false},
    "manager":        {"morning": true,  "progress": true,  "pending": true,  "overdue": true,  "closing": true}
  }'::jsonb,
  add column if not exists last_line_morning_on date,
  add column if not exists last_line_progress_at timestamptz,
  add column if not exists last_line_closing_on date;
