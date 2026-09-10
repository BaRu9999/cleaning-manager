/**
 * タスク状態（status）まわりの表示ヘルパーと遷移判定。純関数。
 */

import type { TaskStatus } from "@/config/constants";

/** カード全体の見た目（背景・枠） */
export const STATUS_CARD_CLASS: Record<TaskStatus, string> = {
  pending: "border-slate-200 bg-white",
  in_progress: "border-sky-300 bg-sky-50",
  done: "border-emerald-300 bg-emerald-50",
  overdue: "border-red-300 bg-red-50",
  skipped: "border-slate-200 bg-slate-50 opacity-70",
};

/** 未完了（本日やるべきなのに終わっていない）状態か */
export function isOpen(status: TaskStatus): boolean {
  return status === "pending" || status === "in_progress" || status === "overdue";
}

/** 「予定」に数える（スキップは予定から除外） */
export function isPlanned(status: TaskStatus): boolean {
  return status !== "skipped";
}

/** 次に押すべきボタンのラベル（null = 操作なし） */
export function nextActionLabel(status: TaskStatus): string | null {
  switch (status) {
    case "pending":
    case "overdue":
      return "清掃開始";
    case "in_progress":
      return "完了する";
    default:
      return null;
  }
}

/** 状態遷移の妥当性（サーバー側の二重チェック用） */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    pending: ["in_progress", "done", "skipped", "overdue"],
    overdue: ["in_progress", "done", "skipped"],
    in_progress: ["done", "pending", "skipped", "overdue"],
    done: ["pending", "in_progress"], // 差戻し
    skipped: ["pending"], // 再開
  };
  return allowed[from]?.includes(to) ?? false;
}
