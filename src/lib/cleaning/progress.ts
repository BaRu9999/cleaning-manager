/**
 * 進捗集計（純関数）。ホーム画面の「本日の進捗」と各種完了率で共用する。
 */

import type { TaskStatus } from "@/config/constants";

export interface ProgressSummary {
  /** 生成された全タスク数 */
  total: number;
  /** 予定数（total からスキップを除く） */
  planned: number;
  done: number;
  inProgress: number;
  pending: number;
  overdue: number;
  skipped: number;
  /** 完了率 %（done / planned、0除算は0） */
  rate: number;
}

export function summarizeProgress(
  tasks: { status: TaskStatus }[],
): ProgressSummary {
  let done = 0;
  let inProgress = 0;
  let pending = 0;
  let overdue = 0;
  let skipped = 0;

  for (const t of tasks) {
    switch (t.status) {
      case "done":
        done += 1;
        break;
      case "in_progress":
        inProgress += 1;
        break;
      case "pending":
        pending += 1;
        break;
      case "overdue":
        overdue += 1;
        break;
      case "skipped":
        skipped += 1;
        break;
    }
  }

  const total = tasks.length;
  const planned = total - skipped;
  const rate = planned > 0 ? Math.round((done / planned) * 100) : 0;

  return { total, planned, done, inProgress, pending, overdue, skipped, rate };
}
