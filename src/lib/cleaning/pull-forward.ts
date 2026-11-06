/**
 * 「前倒し消化」の純ロジック。
 * 清掃を本来の予定日より前に実施済みの場合、その回の予定タスクを免除（自動完了）する。
 * 繰越（carry-over.ts：未完了を未来へ）とは逆方向（未来の予定を今回分で前倒しに免除）。
 */

import type { Frequency } from "@/config/constants";
import { addDays } from "@/lib/date/jst";
import { shouldRunOn, type RecurrenceRule } from "./recurrence";

/** 毎日（daily）・手動（manual）は「前倒し」の概念が無いため対象外 */
export function isPullForwardEligible(frequency: Frequency): boolean {
  return frequency !== "daily" && frequency !== "manual";
}

/**
 * beforeDate より前で、このルールが直近に発火した日付（無ければ null）。
 * maxLookbackDays を超えて遡っても見つからない場合も null（interval の初回発生など。
 * その場合は前倒し判定そのものを行わない＝安全側）。
 */
export function findPreviousOccurrence(
  rule: RecurrenceRule,
  beforeDate: string,
  maxLookbackDays = 400,
): string | null {
  let cur = addDays(beforeDate, -1);
  for (let i = 0; i < maxLookbackDays; i++) {
    if (shouldRunOn(rule, cur)) return cur;
    cur = addDays(cur, -1);
  }
  return null;
}

export interface DoneTaskForFulfillment {
  id: string;
  taskDate: string;
  completedAt: string | null;
  completedById: string | null;
}

export interface PullForwardFulfillment {
  taskId: string;
  taskDate: string;
  completedAt: string | null;
  completedById: string | null;
}

/**
 * previousOccurrence（除外）〜 candidateDate（除外）の間に完了済みタスクがあれば、
 * その中で最新のものを前倒し消化の充足元として返す（無ければ null）。
 */
export function findFulfillment(
  doneTasks: DoneTaskForFulfillment[],
  previousOccurrence: string,
  candidateDate: string,
): PullForwardFulfillment | null {
  const inWindow = doneTasks.filter(
    (t) => t.taskDate > previousOccurrence && t.taskDate < candidateDate,
  );
  if (inWindow.length === 0) return null;
  const latest = inWindow.reduce((a, b) => (a.taskDate >= b.taskDate ? a : b));
  return {
    taskId: latest.id,
    taskDate: latest.taskDate,
    completedAt: latest.completedAt,
    completedById: latest.completedById,
  };
}

/** 充足元の情報を元に、生成予定だったタスク行（pending）を前倒し消化済み（done）へ上書きする */
export function applyFulfillment(
  row: Record<string, unknown>,
  fulfillment: PullForwardFulfillment,
): Record<string, unknown> {
  return {
    ...row,
    status: "done",
    completed_at: fulfillment.completedAt,
    completed_by: fulfillment.completedById,
    comment: `前倒し消化（${fulfillment.taskDate} 実施分で充足）`,
    fulfilled_by_task_id: fulfillment.taskId,
  };
}
