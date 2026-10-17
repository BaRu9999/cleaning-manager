-- =========================================================================
-- 勤務シフト連携（タニタ等の出勤CSV取込）＋ 兼務ポジション対応
--   1. daily_staffing.positions（複数ポジション。ホール・キッチン兼務に対応）
--   2. shift_name_aliases（CSV氏名 ↔ スタッフの対応付け。初回だけ手動マッピングし以後は自動）
--   3. shift_import_logs（取込履歴）
-- 適用: Supabase SQL Editor（0001〜0005 の後）
-- 既存 migration は変更しない。既存データは削除しない（列追加のみ・非破壊）。
-- =========================================================================

-- ---- daily_staffing: 複数ポジション対応 ----
-- 既存の position（単一・表示用）はそのまま残す。判定ロジックは positions を優先し、
-- 空配列なら position 1件を使う（後方互換）。
alter table public.daily_staffing
  add column if not exists positions text[] not null default '{}';

-- =========================================================================
-- shift_name_aliases  (シフトCSVの氏名表記 ↔ users の対応。取込のたびに手入力させない)
-- =========================================================================
create table if not exists public.shift_name_aliases (
  id         uuid primary key default gen_random_uuid(),
  alias      text not null unique,  -- CSV上の表記そのまま（例: "鈴木(り)"）
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shift_name_aliases_user_idx on public.shift_name_aliases (user_id);

drop trigger if exists trg_shift_name_aliases_updated_at on public.shift_name_aliases;
create trigger trg_shift_name_aliases_updated_at
  before update on public.shift_name_aliases
  for each row execute function public.set_updated_at();

alter table public.shift_name_aliases enable row level security;

drop policy if exists shift_name_aliases_all on public.shift_name_aliases;
create policy shift_name_aliases_all on public.shift_name_aliases
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- shift_import_logs  (シフトCSV取込の履歴)
-- =========================================================================
create table if not exists public.shift_import_logs (
  id               uuid primary key default gen_random_uuid(),
  imported_at      timestamptz not null default now(),
  imported_by      uuid references public.users (id) on delete set null,
  source_filename  text,
  work_date_from   date,
  work_date_to     date,
  row_count        integer not null default 0,
  matched_count    integer not null default 0,
  unmatched_names  jsonb not null default '[]'::jsonb
);
create index if not exists shift_import_logs_date_idx on public.shift_import_logs (imported_at desc);

alter table public.shift_import_logs enable row level security;

drop policy if exists shift_import_logs_all on public.shift_import_logs;
create policy shift_import_logs_all on public.shift_import_logs
  for all using (public.is_admin()) with check (public.is_admin());
