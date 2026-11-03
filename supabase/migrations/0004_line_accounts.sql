-- =========================================================================
-- LINE アカウント紐付け（staff_line_accounts）と 通知履歴（notification_logs）
-- 適用: Supabase SQL Editor（0003 の後）
--
-- ・LINE userId ↔ スタッフ(users.id) を紐付ける。line_user_id は UNIQUE
--   （1つの LINE アカウントを複数スタッフに紐付けない）
-- ・LIFF からの登録はサーバーが LINE の ID トークンを検証してから
--   service_role で書き込む（RLS 書き込みは管理者と本人のみ）
-- ・unfollow（ブロック）時は is_active=false / blocked_at のみ更新し、行は消さない
-- ・notification_logs で重複送信を防止（dedupe_key UNIQUE）
-- =========================================================================

create table if not exists public.staff_line_accounts (
  id                uuid primary key default gen_random_uuid(),
  staff_id          uuid not null references public.users (id) on delete cascade,
  line_user_id      text not null unique,
  line_display_name text,
  is_active         boolean not null default true,
  registered_at     timestamptz not null default now(),
  blocked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (staff_id)                     -- 1スタッフ = 1 LINE アカウント
);
create index if not exists staff_line_accounts_staff_idx on public.staff_line_accounts (staff_id);
create index if not exists staff_line_accounts_active_idx on public.staff_line_accounts (is_active) where is_active;

drop trigger if exists trg_staff_line_accounts_updated_at on public.staff_line_accounts;
create trigger trg_staff_line_accounts_updated_at
  before update on public.staff_line_accounts
  for each row execute function public.set_updated_at();

-- =========================================================================
-- notification_logs  (LINE 通知の送信履歴 / 重複防止)
-- =========================================================================
create table if not exists public.notification_logs (
  id                uuid primary key default gen_random_uuid(),
  notification_type text not null,        -- daily / digest / reminder:-30 / overdue / admin_report ...
  cleaning_task_id  uuid references public.cleaning_tasks (id) on delete cascade,
  staff_id          uuid references public.users (id) on delete set null,
  line_user_id      text,
  sent_at           timestamptz not null default now(),
  status            text not null default 'sent' check (status in ('sent','failed','skipped')),
  line_request_id   text,
  error_message     text,
  -- 同一タスク・同一種別・同一タイミングの二重送信を弾く一意キー
  dedupe_key        text not null unique
);
create index if not exists notification_logs_type_idx on public.notification_logs (notification_type, sent_at desc);
create index if not exists notification_logs_task_idx on public.notification_logs (cleaning_task_id);
create index if not exists notification_logs_staff_idx on public.notification_logs (staff_id, sent_at desc);

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.staff_line_accounts enable row level security;
alter table public.notification_logs   enable row level security;

-- staff_line_accounts: 参照=在籍メンバー（スタッフ一覧の連携状況表示） /
--   変更=管理者 or 本人（本人は解除のみ想定）
drop policy if exists staff_line_accounts_select on public.staff_line_accounts;
create policy staff_line_accounts_select on public.staff_line_accounts
  for select using (public.is_active_member());

drop policy if exists staff_line_accounts_write on public.staff_line_accounts;
create policy staff_line_accounts_write on public.staff_line_accounts
  for all
  using (public.is_admin() or staff_id = auth.uid())
  with check (public.is_admin() or staff_id = auth.uid());

-- notification_logs: 管理者のみ参照 / 書き込みは service_role（Cron）に限る
drop policy if exists notification_logs_admin on public.notification_logs;
create policy notification_logs_admin on public.notification_logs
  for all using (public.is_admin()) with check (public.is_admin());
