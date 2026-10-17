-- =========================================================================
-- 清掃の Slack 通知設定を、同じ Supabase プロジェクトを共有する棚卸し管理システム等が
-- 使う notification_settings から分離する。
--   症状: 清掃側の管理画面で Webhook URL を保存すると、棚卸し側が読んでいる同じ行の
--         同じ列（slack_webhook_url 等）が上書きされ、棚卸し側の通知も変わってしまう。
--   方針: 清掃専用の notify_daily_plan/notify_overdue/notify_closing_summary（＋Slack関連・
--         送信済み日時）だけを専用テーブルへ移す。LINE関連列（line_*）は棚卸し側が
--         関与しない清掃専用の列のため、引き続き notification_settings に残す
--         （移動対象を増やすとかえって影響範囲が広がるため）。
-- 適用: Supabase SQL Editor（0001〜0007 の後）
-- 既存 migration・既存テーブル（notification_settings 含む）は変更しない。
-- 棚卸し側のテーブル・データにも一切触れない（新規テーブルを追加するだけ）。
-- =========================================================================
begin;

create table if not exists public.cleaning_notification_settings (
  id smallint primary key default 1 check (id = 1),
  slack_enabled boolean not null default false,
  slack_webhook_url text,
  notify_daily_plan boolean not null default true,
  notify_overdue boolean not null default true,
  notify_closing_summary boolean not null default true,
  last_daily_plan_on date,
  last_closing_summary_on date,
  updated_at timestamptz not null default now()
);

alter table public.cleaning_notification_settings enable row level security;
revoke all on public.cleaning_notification_settings from anon;
grant select, insert, update, delete on public.cleaning_notification_settings to authenticated;
grant all on public.cleaning_notification_settings to service_role;

-- 参照・変更とも管理者のみ（既存 notification_settings と同じ方針。Webhook URL を含むため）
drop policy if exists cleaning_notification_settings_all on public.cleaning_notification_settings;
create policy cleaning_notification_settings_all on public.cleaning_notification_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_cleaning_notification_settings_updated_at on public.cleaning_notification_settings;
create trigger trg_cleaning_notification_settings_updated_at
  before update on public.cleaning_notification_settings
  for each row execute function public.set_updated_at();

-- 旧テーブルの notify_* と送信済み日時は清掃専用の値である可能性が高いため引き継ぐ。
-- slack_enabled / slack_webhook_url は棚卸し側と競合してきた値で、どちらが設定したか
-- 判別できないためコピーしない（移行後に清掃側で再設定してもらう＝無効化された状態で開始）。
insert into public.cleaning_notification_settings (
  id, notify_daily_plan, notify_overdue, notify_closing_summary,
  last_daily_plan_on, last_closing_summary_on
)
select 1,
  coalesce((to_jsonb(s)->>'notify_daily_plan')::boolean, true),
  coalesce((to_jsonb(s)->>'notify_overdue')::boolean, true),
  coalesce((to_jsonb(s)->>'notify_closing_summary')::boolean, true),
  (to_jsonb(s)->>'last_daily_plan_on')::date,
  (to_jsonb(s)->>'last_closing_summary_on')::date
from public.notification_settings s where s.id = 1
on conflict (id) do nothing;

insert into public.cleaning_notification_settings (id) values (1)
on conflict (id) do nothing;

commit;
