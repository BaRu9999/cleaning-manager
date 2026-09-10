-- =========================================================================
-- 店舗清掃マネージャー — 初期スキーマ
-- テーブル / トリガー / インデックス / 外部キー / RLS ポリシー
-- 適用: Supabase SQL Editor に貼り付け、または `supabase db push`
--
-- 前提: 1店舗運用。店舗テーブルは持たず、設定はシングルトン行（id = 1）。
-- 日付は JST 暦日を 'YYYY-MM-DD' 文字列で保存。期限のみ timestamptz（due_at）。
-- =========================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- 共通トリガー関数: updated_at 自動更新
-- -------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- users  (auth.users の写像 / RLS の要)
-- =========================================================================
create table if not exists public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text not null,
  role         text not null default 'staff' check (role in ('admin','staff')),
  position     text,                       -- 担当ポジション（store_settings.positions のいずれか）
  phone        text,
  active       boolean not null default false,  -- 管理者が承認するまで false
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists users_role_idx on public.users (role) where active;
create index if not exists users_position_idx on public.users (position) where active;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- RLS ヘルパー（再帰ポリシーを避けるため SECURITY DEFINER）
-- -------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin' and u.active
  );
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.active
  );
$$;

-- -------------------------------------------------------------------------
-- auth.users 追加時に public.users を自動作成
--   1人目 = admin かつ active、2人目以降 = staff かつ active=false（要承認）
--   ※ auth スキーマへのトリガー作成が不可な環境では、アプリ側 guard.ts が
--     同等の行を idempotent に upsert するためこの関数は無くても動作する。
-- -------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
begin
  select count(*) into existing_count from public.users;
  insert into public.users (id, email, display_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,'staff'),'@',1)),
    case when existing_count = 0 then 'admin' else 'staff' end,
    case when existing_count = 0 then true else false end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -------------------------------------------------------------------------
-- 権限昇格・最後の管理者ロック防止
-- -------------------------------------------------------------------------
create or replace function public.guard_users_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 自分のロール / 在籍フラグを自分で変更できるのは管理者のみ
  if tg_op = 'UPDATE' and old.id = auth.uid() and not public.is_admin() then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      raise exception '自分の権限・在籍状態は変更できません';
    end if;
  end if;

  -- 最後の有効な管理者を降格 / 無効化しない
  if tg_op = 'UPDATE'
     and old.role = 'admin' and old.active
     and (new.role <> 'admin' or not new.active)
     and (select count(*) from public.users where role = 'admin' and active) <= 1 then
    raise exception '最後の管理者は降格・無効化できません';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_users_guard on public.users;
create trigger trg_users_guard
  before update on public.users
  for each row execute function public.guard_users_write();

-- =========================================================================
-- cleaning_categories  (清掃カテゴリー)
-- =========================================================================
create table if not exists public.cleaning_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cleaning_categories_sort_idx on public.cleaning_categories (sort_order, name);

drop trigger if exists trg_cleaning_categories_updated_at on public.cleaning_categories;
create trigger trg_cleaning_categories_updated_at
  before update on public.cleaning_categories
  for each row execute function public.set_updated_at();

-- =========================================================================
-- cleaning_areas  (清掃場所)
-- =========================================================================
create table if not exists public.cleaning_areas (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.cleaning_categories (id) on delete restrict,
  name        text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (category_id, name)
);
create index if not exists cleaning_areas_category_idx on public.cleaning_areas (category_id, sort_order);

drop trigger if exists trg_cleaning_areas_updated_at on public.cleaning_areas;
create trigger trg_cleaning_areas_updated_at
  before update on public.cleaning_areas
  for each row execute function public.set_updated_at();

-- =========================================================================
-- cleaning_master  (清掃項目マスタ)
-- =========================================================================
create table if not exists public.cleaning_master (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  area_id            uuid references public.cleaning_areas (id) on delete set null,
  category_id        uuid references public.cleaning_categories (id) on delete set null, -- area から同期
  description        text,           -- 清掃内容
  method             text,           -- 清掃方法
  supplies           text,           -- 使用する洗剤・備品
  estimated_minutes  integer check (estimated_minutes is null or estimated_minutes >= 0),
  position           text,           -- 担当ポジション
  default_assignee_id uuid references public.users (id) on delete set null, -- 担当スタッフ
  photo_requirement  text not null default 'optional' check (photo_requirement in ('required','optional','none')),
  priority           text not null default 'normal' check (priority in ('low','normal','high')),
  notes              text,           -- 備考
  active             boolean not null default true,   -- 有効 / 無効
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists cleaning_master_active_idx on public.cleaning_master (active);
create index if not exists cleaning_master_area_idx on public.cleaning_master (area_id);
create index if not exists cleaning_master_category_idx on public.cleaning_master (category_id);
create index if not exists cleaning_master_assignee_idx on public.cleaning_master (default_assignee_id);

drop trigger if exists trg_cleaning_master_updated_at on public.cleaning_master;
create trigger trg_cleaning_master_updated_at
  before update on public.cleaning_master
  for each row execute function public.set_updated_at();

-- area_id をセットしたら category_id を自動同期（area 未設定時は入力値を尊重）
create or replace function public.sync_master_category()
returns trigger
language plpgsql
as $$
begin
  if new.area_id is not null then
    select category_id into new.category_id
    from public.cleaning_areas where id = new.area_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cleaning_master_sync_category on public.cleaning_master;
create trigger trg_cleaning_master_sync_category
  before insert or update of area_id on public.cleaning_master
  for each row execute function public.sync_master_category();

-- =========================================================================
-- cleaning_schedules  (清掃項目ごとの繰り返しルール。1項目に複数可)
-- =========================================================================
create table if not exists public.cleaning_schedules (
  id            uuid primary key default gen_random_uuid(),
  master_id     uuid not null references public.cleaning_master (id) on delete cascade,
  frequency     text not null check (frequency in
                  ('daily','weekday','weekly','biweekly','monthly',
                   'monthly_twice','day_of_month','interval','manual')),
  weekdays      smallint[] not null default '{}',   -- 0=日 .. 6=土
  days_of_month smallint[] not null default '{}',   -- 1 .. 31
  interval_days integer check (interval_days is null or interval_days >= 1),
  anchor_date   date,                               -- biweekly / interval の基準日
  time_slot     text not null default 'open_hours' check (time_slot in
                  ('before_open','pre_lunch','post_lunch','idle','pre_dinner',
                   'open_hours','closing','fixed_time')),
  fixed_time    time,                               -- time_slot='fixed_time' のとき
  due_time      time,                               -- 期限時刻（任意）
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 曜日系は weekdays 必須 / 日付系は days_of_month 必須 / interval は interval_days 必須
  check (frequency <> 'weekday' or coalesce(array_length(weekdays,1),0) >= 1),
  check (frequency not in ('weekly','biweekly') or coalesce(array_length(weekdays,1),0) >= 1),
  check (frequency not in ('monthly','monthly_twice','day_of_month') or coalesce(array_length(days_of_month,1),0) >= 1),
  check (frequency <> 'interval' or (interval_days is not null and anchor_date is not null)),
  check (time_slot <> 'fixed_time' or fixed_time is not null)
);
create index if not exists cleaning_schedules_master_idx on public.cleaning_schedules (master_id) where active;
create index if not exists cleaning_schedules_active_idx on public.cleaning_schedules (active, frequency);

drop trigger if exists trg_cleaning_schedules_updated_at on public.cleaning_schedules;
create trigger trg_cleaning_schedules_updated_at
  before update on public.cleaning_schedules
  for each row execute function public.set_updated_at();

-- =========================================================================
-- cleaning_tasks  (Cron が日次生成する当日タスク。状態機械を持つ)
--   master / schedule を消しても履歴として残るよう snapshot 列を保持
-- =========================================================================
create table if not exists public.cleaning_tasks (
  id                 uuid primary key default gen_random_uuid(),
  master_id          uuid references public.cleaning_master (id) on delete set null,
  schedule_id        uuid references public.cleaning_schedules (id) on delete set null,
  task_date          date not null,                 -- JST 暦日
  -- snapshot（生成時点のマスタ値。以後マスタを変更しても当日タスクは不変）
  master_name        text not null,
  area_id            uuid references public.cleaning_areas (id) on delete set null,
  area_label         text,
  category_id        uuid references public.cleaning_categories (id) on delete set null,
  category_label     text,
  time_slot          text not null,
  fixed_time         time,
  due_at             timestamptz,                   -- task_date + due_time を JST として timestamptz 化
  position           text,
  assignee_id        uuid references public.users (id) on delete set null,
  photo_requirement  text not null default 'optional' check (photo_requirement in ('required','optional','none')),
  priority           text not null default 'normal' check (priority in ('low','normal','high')),
  estimated_minutes  integer,
  notes              text,
  -- 状態
  status             text not null default 'pending' check (status in
                       ('pending','in_progress','done','overdue','skipped')),
  was_overdue        boolean not null default false,
  source             text not null default 'auto' check (source in ('auto','manual')),
  started_at         timestamptz,
  started_by         uuid references public.users (id) on delete set null,
  completed_at       timestamptz,
  completed_by       uuid references public.users (id) on delete set null,
  actual_minutes     integer check (actual_minutes is null or actual_minutes >= 0),
  comment            text,
  skip_reason        text,
  overdue_notified_at timestamptz,                  -- Slack 未実施通知を送った時刻（1回だけ）
  created_by         uuid references public.users (id) on delete set null, -- 手動追加者
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists cleaning_tasks_date_status_idx on public.cleaning_tasks (task_date, status);
create index if not exists cleaning_tasks_assignee_date_idx on public.cleaning_tasks (assignee_id, task_date);
create index if not exists cleaning_tasks_master_date_idx on public.cleaning_tasks (master_id, task_date);
create index if not exists cleaning_tasks_due_idx on public.cleaning_tasks (due_at) where status in ('pending','in_progress');
-- 自動生成の重複防止（同じ schedule × 日付は1件）
create unique index if not exists cleaning_tasks_auto_unique_idx
  on public.cleaning_tasks (master_id, coalesce(schedule_id, '00000000-0000-0000-0000-000000000000'::uuid), task_date)
  where source = 'auto';

drop trigger if exists trg_cleaning_tasks_updated_at on public.cleaning_tasks;
create trigger trg_cleaning_tasks_updated_at
  before update on public.cleaning_tasks
  for each row execute function public.set_updated_at();

-- =========================================================================
-- cleaning_logs  (状態変化の追記専用ログ)
-- =========================================================================
create table if not exists public.cleaning_logs (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.cleaning_tasks (id) on delete cascade,
  master_id      uuid references public.cleaning_master (id) on delete set null,
  master_name    text not null,
  task_date      date not null,
  action         text not null check (action in
                   ('generate','start','complete','skip','reopen','uncomplete')),
  status_after   text not null,
  actor_id       uuid references public.users (id) on delete set null,
  comment        text,
  actual_minutes integer,
  created_at     timestamptz not null default now()
);
create index if not exists cleaning_logs_task_idx on public.cleaning_logs (task_id, created_at desc);
create index if not exists cleaning_logs_master_date_idx on public.cleaning_logs (master_id, task_date);
create index if not exists cleaning_logs_actor_idx on public.cleaning_logs (actor_id, created_at desc);

-- =========================================================================
-- cleaning_photos  (完了時の写真 / Supabase Storage の 'cleaning-photos' バケット)
-- =========================================================================
create table if not exists public.cleaning_photos (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.cleaning_tasks (id) on delete cascade,
  log_id       uuid references public.cleaning_logs (id) on delete set null,
  storage_path text not null,
  uploaded_by  uuid references public.users (id) on delete set null,
  bytes        integer,
  created_at   timestamptz not null default now()
);
create index if not exists cleaning_photos_task_idx on public.cleaning_photos (task_id, created_at);

-- =========================================================================
-- notification_settings  (Slack 通知設定 / シングルトン id = 1)
-- =========================================================================
create table if not exists public.notification_settings (
  id                      smallint primary key default 1 check (id = 1),
  slack_enabled           boolean not null default false,
  slack_webhook_url       text,
  notify_daily_plan       boolean not null default true,
  notify_overdue          boolean not null default true,
  notify_closing_summary  boolean not null default true,
  last_daily_plan_on      date,
  last_closing_summary_on date,
  updated_at              timestamptz not null default now()
);
insert into public.notification_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_notification_settings_updated_at on public.notification_settings;
create trigger trg_notification_settings_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- =========================================================================
-- store_settings  (店舗設定 / シングルトン id = 1)
-- =========================================================================
create table if not exists public.store_settings (
  id          smallint primary key default 1 check (id = 1),
  store_name  text not null default '店舗',
  timezone    text not null default 'Asia/Tokyo',
  open_time   time not null default '10:00',
  close_time  time not null default '22:00',
  time_slots  jsonb not null default '[
    {"key":"before_open","label":"営業前","start":"10:00","end":"11:00"},
    {"key":"pre_lunch","label":"ランチ前","start":"11:00","end":"11:30"},
    {"key":"post_lunch","label":"ランチ後","start":"14:00","end":"15:00"},
    {"key":"idle","label":"アイドル","start":"15:00","end":"17:00"},
    {"key":"pre_dinner","label":"ディナー前","start":"17:00","end":"18:00"},
    {"key":"open_hours","label":"営業中","start":"11:00","end":"22:00"},
    {"key":"closing","label":"閉店作業","start":"22:00","end":"23:00"},
    {"key":"fixed_time","label":"時刻指定","start":null,"end":null}
  ]'::jsonb,
  positions   jsonb not null default '["ホール","キッチン","バックヤード","マネージャー"]'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_store_settings_updated_at on public.store_settings;
create trigger trg_store_settings_updated_at
  before update on public.store_settings
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.users                 enable row level security;
alter table public.cleaning_categories   enable row level security;
alter table public.cleaning_areas        enable row level security;
alter table public.cleaning_master       enable row level security;
alter table public.cleaning_schedules    enable row level security;
alter table public.cleaning_tasks        enable row level security;
alter table public.cleaning_logs         enable row level security;
alter table public.cleaning_photos       enable row level security;
alter table public.notification_settings enable row level security;
alter table public.store_settings        enable row level security;

-- ---- users ----
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (id = auth.uid() or public.is_active_member());

drop policy if exists users_insert on public.users;
create policy users_insert on public.users
  for insert with check (id = auth.uid() or public.is_admin());

drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists users_delete on public.users;
create policy users_delete on public.users
  for delete using (public.is_admin());

-- ---- マスタ系: 参照=メンバー / 変更=管理者 ----
do $$
declare t text;
begin
  foreach t in array array['cleaning_categories','cleaning_areas','cleaning_master','cleaning_schedules']
  loop
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format('create policy %I_select on public.%I for select using (public.is_active_member());', t, t);
    execute format('drop policy if exists %I_write on public.%I;', t, t);
    execute format('create policy %I_write on public.%I for all
      using (public.is_admin()) with check (public.is_admin());', t, t);
  end loop;
end $$;

-- ---- cleaning_tasks: 参照=メンバー / 追加削除=管理者 / 更新=メンバー（開始・完了） ----
drop policy if exists cleaning_tasks_select on public.cleaning_tasks;
create policy cleaning_tasks_select on public.cleaning_tasks
  for select using (public.is_active_member());

drop policy if exists cleaning_tasks_insert on public.cleaning_tasks;
create policy cleaning_tasks_insert on public.cleaning_tasks
  for insert with check (public.is_admin());

drop policy if exists cleaning_tasks_update on public.cleaning_tasks;
create policy cleaning_tasks_update on public.cleaning_tasks
  for update using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists cleaning_tasks_delete on public.cleaning_tasks;
create policy cleaning_tasks_delete on public.cleaning_tasks
  for delete using (public.is_admin());

-- ---- cleaning_logs: 参照=メンバー / 追加=本人 / 削除=管理者 ----
drop policy if exists cleaning_logs_select on public.cleaning_logs;
create policy cleaning_logs_select on public.cleaning_logs
  for select using (public.is_active_member());

drop policy if exists cleaning_logs_insert on public.cleaning_logs;
create policy cleaning_logs_insert on public.cleaning_logs
  for insert with check (public.is_active_member() and actor_id = auth.uid());

drop policy if exists cleaning_logs_delete on public.cleaning_logs;
create policy cleaning_logs_delete on public.cleaning_logs
  for delete using (public.is_admin());

-- ---- cleaning_photos: 参照=メンバー / 追加=本人 / 削除=管理者 or アップロード者 ----
drop policy if exists cleaning_photos_select on public.cleaning_photos;
create policy cleaning_photos_select on public.cleaning_photos
  for select using (public.is_active_member());

drop policy if exists cleaning_photos_insert on public.cleaning_photos;
create policy cleaning_photos_insert on public.cleaning_photos
  for insert with check (public.is_active_member() and uploaded_by = auth.uid());

drop policy if exists cleaning_photos_delete on public.cleaning_photos;
create policy cleaning_photos_delete on public.cleaning_photos
  for delete using (public.is_admin() or uploaded_by = auth.uid());

-- ---- store_settings: 参照=メンバー / 変更=管理者 ----
drop policy if exists store_settings_select on public.store_settings;
create policy store_settings_select on public.store_settings
  for select using (public.is_active_member());

drop policy if exists store_settings_write on public.store_settings;
create policy store_settings_write on public.store_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- notification_settings: 参照・変更とも管理者のみ（Webhook URL を含むため） ----
drop policy if exists notification_settings_all on public.notification_settings;
create policy notification_settings_all on public.notification_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- 初期マスタ（カテゴリー / 清掃場所）
-- =========================================================================
insert into public.cleaning_categories (name, sort_order) values
  ('ホール', 10), ('キッチン', 20), ('バックヤード', 30), ('その他', 40)
on conflict (name) do nothing;

insert into public.cleaning_areas (category_id, name, sort_order)
select c.id, a.name, a.sort_order
from (values
  ('ホール','テーブル',10),('ホール','椅子',20),('ホール','ソファ',30),('ホール','卓上備品',40),
  ('ホール','床',50),('ホール','壁',60),('ホール','窓',70),('ホール','レジ周辺',80),('ホール','ドリンク周辺',90),
  ('キッチン','作業台',10),('キッチン','シンク',20),('キッチン','冷蔵庫',30),('キッチン','冷凍庫',40),
  ('キッチン','電子レンジ',50),('キッチン','コンロ',60),('キッチン','フライヤー',70),('キッチン','食洗機',80),
  ('キッチン','排水口',90),('キッチン','床',100),('キッチン','壁',110),('キッチン','棚',120),
  ('バックヤード','ストック棚',10),('バックヤード','冷蔵庫',20),('バックヤード','冷凍庫',30),
  ('バックヤード','床',40),('バックヤード','ゴミ置き場',50),
  ('その他','店頭',10),('その他','看板',20),('その他','従業員スペース',30),('その他','その他',40)
) as a(category_name, name, sort_order)
join public.cleaning_categories c on c.name = a.category_name
on conflict (category_id, name) do nothing;
