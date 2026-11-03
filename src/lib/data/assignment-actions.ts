"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { jstDateString } from "@/lib/date/jst";
import { runAutoAssign } from "@/lib/cleaning/run-auto-assign";
import { fail, ok, toMessage, type ActionResult } from "./result";

/** 本日（または指定日）の清掃を、出勤中スタッフへ推定作業時間が均等になるよう自動割当する */
export async function runAutoAssignAction(
  date?: string,
): Promise<ActionResult<{ assigned: number; unassigned: number }>> {
  try {
    await assertAdmin();
    const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : jstDateString();

    const supabase = await createClient();
    const result = await runAutoAssign(supabase, targetDate);
    if (result.staffCount === 0) {
      return fail("本日の出勤スタッフが登録されていません。先に出勤スタッフを設定してください。");
    }

    revalidatePath("/admin/assignments");
    revalidatePath("/today");
    revalidatePath("/admin");
    return ok({ assigned: result.assigned, unassigned: result.unassigned });
  } catch (e) {
    return fail(toMessage(e));
  }
}

/** 手動で担当を変更する。以後の自動割当で上書きされないよう固定(ロック)する。 */
export async function setTaskAssigneeAction(
  taskId: string,
  assigneeId: string | null,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("cleaning_tasks")
      .update({ assignee_id: assigneeId, assignment_locked: true })
      .eq("id", taskId);
    if (error) return fail(error.message);
    revalidatePath("/admin/assignments");
    revalidatePath("/today");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

/** 固定(ロック)の解除。次回の自動割当で再配分の対象に戻す。 */
export async function setAssignmentLockAction(
  taskId: string,
  locked: boolean,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("cleaning_tasks")
      .update({ assignment_locked: locked })
      .eq("id", taskId);
    if (error) return fail(error.message);
    revalidatePath("/admin/assignments");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
