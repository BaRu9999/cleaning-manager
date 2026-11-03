-- =========================================================================
-- 前日の未実施（pending/overdue のまま放置された）清掃タスクを、当日の生成 Cron が
-- 自動で翌日へ繰り越せるようにする。既存の「実施不可 → 繰越」（手動・オプトイン）とは別に、
-- 誰も実施不可にしなかった（単に忘れられた）タスクも自動で拾う。
--
-- cleaning_tasks.origin_task_id に UNIQUE 制約を追加し、Cron が同じ日に重複実行されても
-- 同じ元タスクから二重に繰越タスクを作らないようにする（NULL 同士は重複とみなされないため、
-- 通常タスク（origin_task_id が NULL）には影響しない）。
-- 既存の非ユニーク部分インデックス（0005）はこの UNIQUE インデックスで代替されるため置き換える。
-- 適用: Supabase SQL Editor（0001〜0008 の後）
-- 既存 migration・既存データは変更しない（インデックスの張り替えのみ・非破壊）。
-- =========================================================================

-- 万一既存データに同じ origin_task_id の重複行がある場合、この UNIQUE INDEX 作成は
-- エラーで失敗する（データは変更されない）。その場合は重複行を調査のうえ個別に対応してから
-- 再実行すること（本番でこれまで繰越は手動の単発操作でしか作られていないため通常は発生しない）。
drop index if exists public.cleaning_tasks_origin_idx;
create unique index if not exists cleaning_tasks_origin_unique_idx
  on public.cleaning_tasks (origin_task_id);
