-- =========================================================================
-- 清掃業務の自動運用強化
--   1. cleaning_tasks: assignment_locked / skip_reason_code / origin_task_id
--   2. daily_staffing（当日出勤スタッフ）
--   3. equipment_issues（設備異常報告）
--   4. cleaning_logs.action に 'carry_over' を追加
-- 適用: Supabase SQL Editor（0001〜0004 の後）
-- 既存 migration は変更しない。既存データは削除しない。
-- =========================================================================

-- ---- cleaning_tasks: 自動割当・繰越・実施不可理由コード ----
alter table public.cleaning_tasks
  add column if not exists assignment_locked boolean not null default false,
  add column if not exists skip_reason_code text
    check (skip_reason_code in
      ('busy','equipment_in_use','supply_shortage','equipment_issue','staff_shortage','safety','other')),
  -- 繰越タスク（今日生成された行）が、元になった前日のタスクを指す
  add column if not exists origin_task_id uuid references public.cleaning_tasks (id) on delete set null;

create index if not exists cleaning_tasks_origin_idx on public.cleaning_tasks (origin_task_id) where origin_task_id is not null;
create index if not exists cleaning_tasks_locked_idx on public.cleaning_tasks (assignment_locked) where assignment_locked;

-- ---- cleaning_logs.action に carry_over を追加（追記型 CHECK 拡張） ----
-- 制約名を決め打ちせず、action 列にかかっている既存の CHECK 制約を動的に検出して
-- 差し替える（0001 の自動命名と異なっていても安全に置き換わる）。
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'cleaning_logs'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%action%'
  loop
    execute format('alter table public.cleaning_logs drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.cleaning_logs add constraint cleaning_logs_action_check
  check (action in ('generate','start','complete','skip','reopen','uncomplete','carry_over'));

-- =========================================================================
-- daily_staffing  (当日の出勤スタッフ。清掃自動割当の母集団)
-- =========================================================================
create table if not exists public.daily_staffing (
  id                     uuid primary key default gen_random_uuid(),
  work_date              date not null,
  user_id                uuid not null references public.users (id) on delete cascade,
  position               text,
  start_time             time,
  end_time               time,
  available_for_cleaning boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (work_date, user_id)
);
create index if not exists daily_staffing_date_idx on public.daily_staffing (work_date);
create index if not exists daily_staffing_available_idx
  on public.daily_staffing (work_date, available_for_cleaning) where available_for_cleaning;

drop trigger if exists trg_daily_staffing_updated_at on public.daily_staffing;
create trigger trg_daily_staffing_updated_at
  before update on public.daily_staffing
  for each row execute function public.set_updated_at();

alter table public.daily_staffing enable row level security;

-- 参照=在籍メンバー / 登録・変更=管理者のみ
drop policy if exists daily_staffing_select on public.daily_staffing;
create policy daily_staffing_select on public.daily_staffing
  for select using (public.is_active_member());

drop policy if exists daily_staffing_write on public.daily_staffing;
create policy daily_staffing_write on public.daily_staffing
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- equipment_issues  (設備異常報告)
-- =========================================================================
create table if not exists public.equipment_issues (
  id              uuid primary key default gen_random_uuid(),
  reported_at     timestamptz not null default now(),
  reported_by     uuid references public.users (id) on delete set null,
  task_id         uuid references public.cleaning_tasks (id) on delete set null,
  master_id       uuid references public.cleaning_master (id) on delete set null,
  area_id         uuid references public.cleaning_areas (id) on delete set null,
  title           text not null,
  description     text,
  severity        text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status          text not null default 'open' check (status in ('open','in_progress','resolved')),
  -- Storage 'cleaning-photos' バケットの equipment/ プレフィックス配下（既存バケットを再利用）
  photo_path      text,
  resolved_at     timestamptz,
  resolved_by     uuid references public.users (id) on delete set null,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists equipment_issues_status_idx on public.equipment_issues (status, reported_at desc);
create index if not exists equipment_issues_task_idx on public.equipment_issues (task_id);
create index if not exists equipment_issues_master_idx on public.equipment_issues (master_id);

drop trigger if exists trg_equipment_issues_updated_at on public.equipment_issues;
create trigger trg_equipment_issues_updated_at
  before update on public.equipment_issues
  for each row execute function public.set_updated_at();

alter table public.equipment_issues enable row level security;

-- 参照=在籍メンバー / 報告(追加)=在籍メンバー本人 / 状態変更=管理者のみ
drop policy if exists equipment_issues_select on public.equipment_issues;
create policy equipment_issues_select on public.equipment_issues
  for select using (public.is_active_member());

drop policy if exists equipment_issues_insert on public.equipment_issues;
create policy equipment_issues_insert on public.equipment_issues
  for insert with check (public.is_active_member() and reported_by = auth.uid());

drop policy if exists equipment_issues_update on public.equipment_issues;
create policy equipment_issues_update on public.equipment_issues
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists equipment_issues_delete on public.equipment_issues;
create policy equipment_issues_delete on public.equipment_issues
  for delete using (public.is_admin());
