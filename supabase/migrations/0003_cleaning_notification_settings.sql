-- 清掃の通知設定を、棚卸し等が利用する notification_settings から分離する。
-- 旧テーブル・データ・RLS は変更しない。アプリの切り替え前に適用する。
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

drop policy if exists cleaning_notification_settings_all on public.cleaning_notification_settings;
create policy cleaning_notification_settings_all on public.cleaning_notification_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_cleaning_notification_settings_updated_at on public.cleaning_notification_settings;
create trigger trg_cleaning_notification_settings_updated_at
  before update on public.cleaning_notification_settings
  for each row execute function public.set_updated_at();

-- 共有 URL と slack_enabled は用途が不明なためコピーしない（再登録まで無効）。
-- JSON 経由で読み、旧テーブルに清掃固有列がない場合にも対応する。
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
