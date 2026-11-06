-- =========================================================================
-- 清掃タスクの「前倒し消化」対応
--   症状: スタッフが本来の予定日より前に同じ清掃項目を実施済みでも、
--         予定日になると通常どおりタスクが再生成され、同じ作業を二重に求められる。
--   方針: 日次タスク生成（runGeneration）が、直前の発生日より後・今回の予定日より前の
--         期間に完了済みタスク（同じ master_id）が既にあれば、今回分のタスクは生成するが
--         最初から完了済み（前倒し消化）として記録する。既存の「実施不可→繰越」
--         （origin_task_id）とは逆方向（未来の予定を今回分で前倒しに免除する）の対応。
-- 適用: Supabase SQL Editor（0001〜0009 の後）
-- 既存 migration・既存データは変更しない（列追加のみ）。
-- =========================================================================

-- 前倒し消化で自動完了にしたタスクが、充足元（実際に作業した方のタスク）を指す
alter table public.cleaning_tasks
  add column if not exists fulfilled_by_task_id uuid references public.cleaning_tasks (id) on delete set null;

create index if not exists cleaning_tasks_fulfilled_by_idx
  on public.cleaning_tasks (fulfilled_by_task_id) where fulfilled_by_task_id is not null;

-- cleaning_logs.action に 'fulfilled_early'（前倒し消化による自動完了）を追加
-- （0005 と同様、制約名を決め打ちせず動的に検出して差し替える）
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
  check (action in
    ('generate','start','complete','skip','reopen','uncomplete','carry_over','fulfilled_early'));
