"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import {
  firstIssue,
  masterInputSchema,
  type ScheduleInput,
} from "@/lib/validation/master";
import { fail, ok, toMessage, type ActionResult } from "./result";

function scheduleRow(masterId: string, s: ScheduleInput): Record<string, unknown> {
  return {
    master_id: masterId,
    frequency: s.frequency,
    weekdays: s.weekdays,
    days_of_month: s.daysOfMonth,
    interval_days: s.intervalDays,
    anchor_date: s.anchorDate,
    time_slot: s.timeSlot,
    fixed_time: s.fixedTime,
    due_time: s.dueTime,
    active: s.active,
  };
}

/**
 * 清掃項目の新規作成 / 更新。payloadJson は MasterForm が組み立てた JSON 文字列。
 * @param id 既存項目の ID（新規作成時は null）
 */
export async function saveMasterAction(
  id: string | null,
  payloadJson: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await assertAdmin();
    let raw: unknown;
    try {
      raw = JSON.parse(payloadJson);
    } catch {
      return fail("入力データの形式が不正です");
    }
    const parsed = masterInputSchema.safeParse(raw);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const input = parsed.data;

    const supabase = await createClient();
    const masterCols = {
      name: input.name,
      area_id: input.areaId,
      category_id: input.categoryId,
      description: input.description,
      method: input.method,
      supplies: input.supplies,
      estimated_minutes: input.estimatedMinutes,
      position: input.position,
      default_assignee_id: input.defaultAssigneeId,
      photo_requirement: input.photoRequirement,
      priority: input.priority,
      notes: input.notes,
      active: input.active,
    };

    let masterId = id ?? "";
    if (id) {
      const { error } = await supabase
        .from("cleaning_master")
        .update(masterCols)
        .eq("id", id);
      if (error) return fail(`更新に失敗しました: ${error.message}`);
    } else {
      const { data, error } = await supabase
        .from("cleaning_master")
        .insert({ ...masterCols, created_by: admin.id })
        .select("id")
        .single();
      if (error || !data) return fail(`作成に失敗しました: ${error?.message ?? ""}`);
      masterId = String((data as { id: string }).id);
    }

    // --- スケジュールの差分同期 ---
    const { data: existing } = await supabase
      .from("cleaning_schedules")
      .select("id")
      .eq("master_id", masterId);
    const existingIds = new Set(
      (existing ?? []).map((r) => String((r as { id: string }).id)),
    );
    const incomingIds = new Set(
      input.schedules.filter((s) => s.id).map((s) => s.id as string),
    );
    const toDelete = [...existingIds].filter((x) => !incomingIds.has(x));
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("cleaning_schedules")
        .delete()
        .in("id", toDelete);
      if (error) return fail(`スケジュール削除に失敗しました: ${error.message}`);
    }
    for (const s of input.schedules) {
      const row = scheduleRow(masterId, s);
      if (s.id && existingIds.has(s.id)) {
        const { error } = await supabase
          .from("cleaning_schedules")
          .update(row)
          .eq("id", s.id);
        if (error) return fail(`スケジュール更新に失敗しました: ${error.message}`);
      } else {
        const { error } = await supabase.from("cleaning_schedules").insert(row);
        if (error) return fail(`スケジュール追加に失敗しました: ${error.message}`);
      }
    }

    revalidatePath("/admin/master");
    revalidatePath(`/admin/master/${masterId}`);
    revalidatePath("/admin");
    return ok({ id: masterId });
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function setMasterActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("cleaning_master")
      .update({ active })
      .eq("id", id);
    if (error) return fail(error.message);
    revalidatePath("/admin/master");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

/**
 * 清掃項目の完全削除。過去のタスク・履歴は snapshot 列で保持されるため消えない
 * （master_id は null 化される）。通常は「無効化」を推奨。
 */
export async function deleteMasterAction(id: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("cleaning_master").delete().eq("id", id);
    if (error) return fail(error.message);
    revalidatePath("/admin/master");
    revalidatePath("/admin");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
