"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRIORITY_LABELS, type Priority, type TaskStatus } from "@/config/constants";
import { formatWorkload, getWorkloadRank } from "@/lib/cleaning/workload";
import {
  runAutoAssignAction,
  setAssignmentLockAction,
  setTaskAssigneeAction,
} from "@/lib/data/assignment-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";

export interface AssignmentTask {
  id: string;
  masterName: string;
  areaLabel: string | null;
  slotLabel: string;
  dueLabel: string | null;
  estimatedMinutes: number | null;
  priority: Priority;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  assignmentLocked: boolean;
  position: string | null;
}

interface StaffOption {
  id: string;
  name: string;
}

const UNASSIGNED = "__unassigned__";

type TaskPatch =
  | { type: "reassign"; taskId: string; assigneeId: string | null; assigneeName: string | null }
  | { type: "lock"; taskId: string; locked: boolean };

export function AssignmentBoard({
  date,
  tasks,
  staffOptions,
}: {
  date: string;
  tasks: AssignmentTask[];
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 担当変更・固定トグルはクリック直後に反映（失敗時は自動でtasksへ戻る＝ロールバック）
  const [optimisticTasks, applyPatch] = useOptimistic<AssignmentTask[], TaskPatch>(
    tasks,
    (state, patch) =>
      state.map((t) => {
        if (t.id !== patch.taskId) return t;
        return patch.type === "reassign"
          ? { ...t, assigneeId: patch.assigneeId, assigneeName: patch.assigneeName }
          : { ...t, assignmentLocked: patch.locked };
      }),
  );

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; tasks: AssignmentTask[] }>();
    for (const t of optimisticTasks) {
      const key = t.assigneeId ?? UNASSIGNED;
      const name = t.assigneeName ?? "未割当";
      const g = map.get(key) ?? { name, tasks: [] };
      g.tasks.push(t);
      map.set(key, g);
    }
    return [...map.entries()]
      .map(([key, g]) => {
        const totalMinutes = g.tasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
        const totalPoints = g.tasks.reduce((s, t) => s + getWorkloadRank(t.estimatedMinutes).points, 0);
        return { key, name: g.name, tasks: g.tasks, totalMinutes, totalPoints };
      })
      .sort((a, b) => (a.key === UNASSIGNED ? 1 : b.key === UNASSIGNED ? -1 : b.totalMinutes - a.totalMinutes));
  }, [optimisticTasks]);

  function autoAssign() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const res = await runAutoAssignAction(date);
      if (!res.ok) setError(res.error);
      else {
        setMsg(`自動割当: ${res.data.assigned}件 割当（未割当 ${res.data.unassigned}件）`);
        router.refresh();
      }
    });
  }

  function reassign(taskId: string, staffId: string) {
    setError(null);
    const assigneeName = staffId ? (staffOptions.find((s) => s.id === staffId)?.name ?? null) : null;
    startTransition(async () => {
      applyPatch({ type: "reassign", taskId, assigneeId: staffId || null, assigneeName });
      const res = await setTaskAssigneeAction(taskId, staffId || null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function toggleLock(taskId: string, locked: boolean) {
    startTransition(async () => {
      applyPatch({ type: "lock", taskId, locked });
      const res = await setAssignmentLockAction(taskId, locked);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="本日の清掃割当"
        subtitle="推定作業時間が均等になるよう自動配分します。手動で変更した担当は固定され、再割当しても保持されます。"
        action={
          <Button size="sm" onClick={autoAssign} disabled={pending}>
            {pending ? "割当中…" : "本日の清掃を自動割当"}
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {msg ? <Alert tone="success">{msg}</Alert> : null}

        {groups.length === 0 ? (
          <p className="text-sm text-slate-400">本日の清掃タスクがありません。</p>
        ) : (
          groups.map((g) => (
            <div
              key={g.key}
              className={
                g.key === UNASSIGNED
                  ? "rounded-lg border border-amber-300 bg-amber-50 p-3"
                  : "rounded-lg border border-slate-200 bg-white p-3"
              }
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-bold text-slate-800">{g.name}</span>
                <span className="tabular text-xs font-bold text-slate-500">
                  {g.tasks.length}件 ・ 合計{g.totalMinutes}分 ・ {g.totalPoints}pt
                </span>
              </div>
              <ul className="space-y-1.5">
                {g.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-800">
                        {t.masterName}
                        {t.priority === "high" ? (
                          <span className="ml-1 text-xs font-bold text-amber-600">
                            [{PRIORITY_LABELS.high}]
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {t.areaLabel ?? "—"} ・ {t.slotLabel}
                        {t.dueLabel ? ` ・ 期限${t.dueLabel}` : ""} ・{" "}
                        {formatWorkload(t.estimatedMinutes)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Select
                        value={t.assigneeId ?? ""}
                        disabled={pending || t.status === "done" || t.status === "in_progress"}
                        onChange={(e) => reassign(t.id, e.target.value)}
                        className="py-1 text-xs"
                      >
                        <option value="">未割当</option>
                        {staffOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        title={t.assignmentLocked ? "固定解除" : "固定する"}
                        onClick={() => toggleLock(t.id, !t.assignmentLocked)}
                        disabled={pending}
                        className={
                          t.assignmentLocked
                            ? "tap rounded-md border border-slate-900 bg-slate-900 px-2 py-1 text-xs text-white"
                            : "tap rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-500"
                        }
                      >
                        🔒
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}
