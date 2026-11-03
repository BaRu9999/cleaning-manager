/**
 * 当日清掃の自動割当の実行本体。Cron（service_role クライアント。タスク生成の直後）と
 * 管理者の手動割当（RLS クライアント、/admin/assignments）の両方から呼ぶ。
 * 出勤スタッフ（daily_staffing）が1件も無い日は割当を行わず staffCount: 0 を返す
 * （シフト未取込・未設定日はフェイルオープンで何もしない。エラーにはしない）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTimeJst, trimSeconds } from "@/lib/date/jst";
import { assignCleaningTasks, type AssignStaff, type AssignTask } from "./assign";

export interface AutoAssignResult {
  date: string;
  staffCount: number;
  assigned: number;
  unassigned: number;
}

async function loadTasksForAssign(supabase: SupabaseClient, date: string): Promise<AssignTask[]> {
  const { data, error } = await supabase
    .from("cleaning_tasks")
    .select(
      "id, position, priority, estimated_minutes, status, assignee_id, assignment_locked, due_at",
    )
    .eq("task_date", date);
  if (error) throw new Error(`清掃タスクの取得に失敗しました: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    position: (r.position as string | null) ?? null,
    priority: (r.priority as AssignTask["priority"]) ?? "normal",
    estimatedMinutes: (r.estimated_minutes as number | null) ?? null,
    status: (r.status as AssignTask["status"]) ?? "pending",
    assigneeId: (r.assignee_id as string | null) ?? null,
    assignmentLocked: r.assignment_locked === true,
    dueTime: formatTimeJst(r.due_at as string | null),
  }));
}

async function loadStaffForAssign(supabase: SupabaseClient, date: string): Promise<AssignStaff[]> {
  const { data, error } = await supabase
    .from("daily_staffing")
    .select(
      "user_id, position, positions, start_time, end_time, available_for_cleaning, " +
        "user:users!user_id(display_name)",
    )
    .eq("work_date", date)
    .eq("available_for_cleaning", true);
  if (error) throw new Error(`出勤スタッフの取得に失敗しました: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const u = r.user as Record<string, unknown> | Record<string, unknown>[] | null;
    const user = Array.isArray(u) ? u[0] : u;
    const positions = Array.isArray(r.positions)
      ? (r.positions as unknown[]).map((p) => String(p)).filter(Boolean)
      : [];
    return {
      id: String(r.user_id),
      name: String(user?.display_name ?? ""),
      positions: positions.length > 0 ? positions : r.position ? [String(r.position)] : [],
      availableForCleaning: r.available_for_cleaning !== false,
      startTime: trimSeconds(r.start_time as string | null),
      endTime: trimSeconds(r.end_time as string | null),
    };
  });
}

/** 指定日の清掃タスクを、その日の daily_staffing（出勤スタッフ）へ自動割当する */
export async function runAutoAssign(
  supabase: SupabaseClient,
  date: string,
): Promise<AutoAssignResult> {
  const [tasks, staff] = await Promise.all([
    loadTasksForAssign(supabase, date),
    loadStaffForAssign(supabase, date),
  ]);

  if (staff.length === 0) {
    return { date, staffCount: 0, assigned: 0, unassigned: 0 };
  }

  const result = assignCleaningTasks({ tasks, staff });

  for (const a of result.assignments) {
    const { error } = await supabase
      .from("cleaning_tasks")
      .update({ assignee_id: a.assigneeId })
      .eq("id", a.taskId);
    if (error) throw new Error(`割当の保存に失敗しました: ${error.message}`);
  }

  return {
    date,
    staffCount: staff.length,
    assigned: result.assignments.length,
    unassigned: result.unassignedTaskIds.length,
  };
}
