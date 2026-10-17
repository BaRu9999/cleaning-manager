/**
 * 当日出勤スタッフへの清掃自動割当（純関数・副作用なし）。
 *
 * 目的は単純な件数均等ではなく「推定作業時間の均等化」。
 *
 * 考慮順:
 *   1. 担当可能ポジション … task.position が設定されていれば、それを positions に含むスタッフのみ候補
 *                          （シフト表で「ホール・キッチン」兼務のスタッフは両方の候補になる）
 *   2. シフトの勤務時間  … task.dueTime が設定されていれば、その時刻に勤務中（startTime〜endTime）
 *                          のスタッフのみ候補（シフト時間未設定のスタッフは制約なし＝候補のまま）
 *   3. 固定担当者        … 現在の assigneeId が「本日出勤・ポジション適合・勤務時間内」なら維持（動かさない）
 *   4. assignment_locked … true のタスクは一切変更しない
 *   5. priority          … high を優先して先に割り当てる
 *   6. estimated_minutes … 同一優先度内は所要時間が長い順（LPT）
 *   7. 現在割当済みの合計時間 … 各時点で最も手が空いている人へ
 *
 * done / in_progress のタスクも対象外（安全に維持）。
 * 同点は workload_points → 担当件数 の順で決定する。
 */

import type { Priority, TaskStatus } from "@/config/constants";
import { getWorkloadRank } from "./workload";

export interface AssignTask {
  id: string;
  /** 担当ポジション。null なら誰でも可 */
  position: string | null;
  priority: Priority;
  estimatedMinutes: number | null;
  status: TaskStatus;
  assigneeId: string | null;
  assignmentLocked: boolean;
  /** 期限（"HH:MM"、JST）。null なら勤務時間による制約は行わない */
  dueTime: string | null;
}

export interface AssignStaff {
  id: string;
  name: string;
  /** 本日対応できるポジション（複数可。例: ["ホール","キッチン"]）。空配列 = 未設定 */
  positions: string[];
  availableForCleaning: boolean;
  /** 本日の勤務時間（"HH:MM"）。どちらか null ならシフト時間による制約は行わない */
  startTime: string | null;
  endTime: string | null;
}

export interface Assignment {
  taskId: string;
  assigneeId: string;
}

export interface StaffLoad {
  staffId: string;
  minutes: number;
  points: number;
  count: number;
}

export interface AssignCleaningTasksResult {
  /** 新規に割り当てた（または担当を変更した）タスク */
  assignments: Assignment[];
  /** 候補スタッフが見つからず割当できなかったタスク */
  unassignedTaskIds: string[];
  /** 最終的な担当者ごとの負荷（既存の固定分・維持分も含む） */
  loadByStaffId: Record<string, StaffLoad>;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

/** "HH:MM" 同士の比較のみ（固定幅の文字列なので文字列比較で正しく順序が付く） */
function isDuringShift(dueTime: string | null, staff: AssignStaff): boolean {
  if (!dueTime || !staff.startTime || !staff.endTime) return true;
  return staff.startTime <= dueTime && dueTime <= staff.endTime;
}

function candidatesFor(staff: AssignStaff[], task: AssignTask): AssignStaff[] {
  const byPosition = task.position ? staff.filter((s) => s.positions.includes(task.position!)) : staff;
  return byPosition.filter((s) => isDuringShift(task.dueTime, s));
}

function addLoad(load: Map<string, StaffLoad>, staffId: string, minutes: number): void {
  const cur = load.get(staffId) ?? { staffId, minutes: 0, points: 0, count: 0 };
  cur.minutes += minutes;
  cur.points += getWorkloadRank(minutes).points;
  cur.count += 1;
  load.set(staffId, cur);
}

/**
 * @param tasks 当日タスク（done/in_progress/assignment_locked は変更されない）
 * @param staff 本日出勤中のスタッフ（availableForCleaning=false は候補から除外）
 */
export function assignCleaningTasks({
  tasks,
  staff,
}: {
  tasks: AssignTask[];
  staff: AssignStaff[];
}): AssignCleaningTasksResult {
  const available = staff.filter((s) => s.availableForCleaning);
  const load = new Map<string, StaffLoad>();

  const assignments: Assignment[] = [];
  const toRebalance: AssignTask[] = [];

  for (const task of tasks) {
    const untouchable =
      task.status === "done" || task.status === "in_progress" || task.assignmentLocked;

    const currentStaff = task.assigneeId
      ? available.find((s) => s.id === task.assigneeId)
      : undefined;
    const keepCurrent =
      !!task.assigneeId &&
      !!currentStaff &&
      (!task.position || currentStaff.positions.includes(task.position)) &&
      isDuringShift(task.dueTime, currentStaff);

    if (untouchable || keepCurrent) {
      // 現状維持。負荷計算には含める（他タスクの均等化判断に反映するため）。
      if (task.assigneeId) addLoad(load, task.assigneeId, task.estimatedMinutes ?? 0);
      continue;
    }

    toRebalance.push(task);
  }

  // priority high → estimated_minutes 大 の順（LPT: Longest Processing Time first）
  toRebalance.sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return (b.estimatedMinutes ?? 0) - (a.estimatedMinutes ?? 0);
  });

  const unassignedTaskIds: string[] = [];

  for (const task of toRebalance) {
    const candidates = candidatesFor(available, task);
    if (candidates.length === 0) {
      unassignedTaskIds.push(task.id);
      continue;
    }

    let best = candidates[0]!;
    let bestLoad = load.get(best.id) ?? { staffId: best.id, minutes: 0, points: 0, count: 0 };
    for (const c of candidates.slice(1)) {
      const cLoad = load.get(c.id) ?? { staffId: c.id, minutes: 0, points: 0, count: 0 };
      if (
        cLoad.minutes < bestLoad.minutes ||
        (cLoad.minutes === bestLoad.minutes && cLoad.points < bestLoad.points) ||
        (cLoad.minutes === bestLoad.minutes &&
          cLoad.points === bestLoad.points &&
          cLoad.count < bestLoad.count)
      ) {
        best = c;
        bestLoad = cLoad;
      }
    }

    assignments.push({ taskId: task.id, assigneeId: best.id });
    addLoad(load, best.id, task.estimatedMinutes ?? 0);
  }

  const loadByStaffId: Record<string, StaffLoad> = {};
  for (const [id, v] of load) loadByStaffId[id] = v;

  return { assignments, unassignedTaskIds, loadByStaffId };
}
