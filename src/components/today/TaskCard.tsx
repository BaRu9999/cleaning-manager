"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PHOTO_REQUIREMENT_LABELS,
  TASK_STATUS_LABELS,
  type PhotoRequirement,
  type Priority,
  type TaskStatus,
} from "@/config/constants";
import { cn } from "@/lib/cn";
import { formatTimeJst } from "@/lib/date/jst";
import { STATUS_CARD_CLASS } from "@/lib/cleaning/status";
import {
  completeTaskAction,
  startTaskAction,
} from "@/lib/data/task-actions";

export interface TaskCardData {
  id: string;
  masterName: string;
  areaLabel: string | null;
  categoryLabel: string | null;
  position: string | null;
  assigneeName: string | null;
  status: TaskStatus;
  dueAt: string | null;
  fixedTime: string | null;
  estimatedMinutes: number | null;
  priority: Priority;
  photoRequirement: PhotoRequirement;
  photoCount: number;
  completedAt: string | null;
  completedByName: string | null;
}

export function TaskCard({ task }: { task: TaskCardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dueText = task.fixedTime
    ? `${task.fixedTime.slice(0, 5)}`
    : formatTimeJst(task.dueAt);
  const needsDetailToComplete =
    task.photoRequirement === "required" && task.photoCount < 1;

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await startTaskAction(task.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function completeQuick() {
    setError(null);
    startTransition(async () => {
      const res = await completeTaskAction(task.id, {});
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className={cn("rounded-xl border p-3 shadow-sm", STATUS_CARD_CLASS[task.status])}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/today/${task.id}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-bold text-slate-900">{task.masterName}</span>
            {task.priority === "high" ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                優先
              </span>
            ) : null}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600">
            <span>
              場所: {task.areaLabel || task.categoryLabel || "—"}
            </span>
            <span>担当: {task.assigneeName || task.position || "指定なし"}</span>
            <span>{dueText ? `${dueText} まで` : "期限なし"}</span>
            <span>
              目安: {task.estimatedMinutes != null ? `${task.estimatedMinutes}分` : "—"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {PHOTO_REQUIREMENT_LABELS[task.photoRequirement]}
            {task.photoCount > 0 ? ` ・ 写真${task.photoCount}枚` : ""}
            {task.status === "done" && task.completedByName
              ? ` ・ ${formatTimeJst(task.completedAt)} ${task.completedByName}`
              : ""}
          </div>
        </Link>

        <div className="flex w-24 shrink-0 flex-col items-end gap-1.5">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-bold",
              task.status === "done" && "bg-emerald-200 text-emerald-900",
              task.status === "in_progress" && "bg-sky-200 text-sky-900",
              task.status === "overdue" && "bg-red-200 text-red-900",
              task.status === "pending" && "bg-slate-200 text-slate-700",
              task.status === "skipped" && "bg-slate-200 text-slate-500",
            )}
          >
            {TASK_STATUS_LABELS[task.status]}
          </span>

          {(task.status === "pending" || task.status === "overdue") && (
            <button
              type="button"
              onClick={start}
              disabled={pending}
              className="tap w-full rounded-lg bg-slate-900 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              清掃開始
            </button>
          )}

          {task.status === "in_progress" &&
            (needsDetailToComplete ? (
              <Link
                href={`/today/${task.id}`}
                className="tap w-full rounded-lg bg-emerald-600 py-2 text-center text-sm font-bold text-white"
              >
                写真を追加
              </Link>
            ) : (
              <button
                type="button"
                onClick={completeQuick}
                disabled={pending}
                className="tap w-full rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                完了する
              </button>
            ))}

          {(task.status === "done" || task.status === "skipped") && (
            <Link
              href={`/today/${task.id}`}
              className="tap w-full rounded-lg border border-slate-300 py-1.5 text-center text-xs font-bold text-slate-600"
            >
              詳細
            </Link>
          )}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
