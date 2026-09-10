"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin, assertMember } from "@/lib/auth/guard";
import { jstDateString, jstDateTimeToInstant } from "@/lib/date/jst";
import { resolveDueTime } from "@/lib/cleaning/slots";
import { getStoreSettings } from "./settings";
import { TIME_SLOTS } from "@/config/constants";
import type { LogAction } from "@/lib/types/domain";
import { fail, ok, toMessage, type ActionResult } from "./result";
import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient;

interface TaskRow {
  id: string;
  status: string;
  was_overdue: boolean;
  master_id: string | null;
  master_name: string;
  photo_requirement: string;
  task_date: string;
}

async function loadTask(supabase: DB, id: string): Promise<TaskRow | null> {
  const { data } = await supabase
    .from("cleaning_tasks")
    .select("id, status, was_overdue, master_id, master_name, photo_requirement, task_date")
    .eq("id", id)
    .maybeSingle();
  return (data as TaskRow | null) ?? null;
}

async function writeLog(
  supabase: DB,
  task: TaskRow,
  action: LogAction,
  statusAfter: string,
  actorId: string,
  extra: { comment?: string | null; actualMinutes?: number | null } = {},
): Promise<void> {
  await supabase.from("cleaning_logs").insert({
    task_id: task.id,
    master_id: task.master_id,
    master_name: task.master_name,
    task_date: task.task_date,
    action,
    status_after: statusAfter,
    actor_id: actorId,
    comment: extra.comment ?? null,
    actual_minutes: extra.actualMinutes ?? null,
  });
}

function revalidateTaskViews(taskId: string) {
  revalidatePath("/today");
  revalidatePath(`/today/${taskId}`);
  revalidatePath("/history");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// 清掃開始
// ---------------------------------------------------------------------------
export async function startTaskAction(taskId: string): Promise<ActionResult> {
  try {
    const me = await assertMember();
    const supabase = await createClient();
    const task = await loadTask(supabase, taskId);
    if (!task) return fail("タスクが見つかりません");
    if (task.status === "done") return fail("すでに完了しています");
    if (task.status === "skipped") return fail("スキップ済みです");
    if (task.status === "in_progress") return ok(); // 冪等

    const { error } = await supabase
      .from("cleaning_tasks")
      .update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        started_by: me.id,
      })
      .eq("id", taskId);
    if (error) return fail(error.message);
    await writeLog(supabase, task, "start", "in_progress", me.id);
    revalidateTaskViews(taskId);
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// ---------------------------------------------------------------------------
// 完了
// ---------------------------------------------------------------------------
const completeSchema = z.object({
  comment: z.string().trim().max(2000).optional().default(""),
  actualMinutes: z.coerce.number().int().min(0).max(600).nullable().optional(),
});

export async function completeTaskAction(
  taskId: string,
  input: { comment?: string; actualMinutes?: number | null },
): Promise<ActionResult> {
  try {
    const me = await assertMember();
    const parsed = completeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const supabase = await createClient();
    const task = await loadTask(supabase, taskId);
    if (!task) return fail("タスクが見つかりません");
    if (task.status === "done") return fail("すでに完了しています");
    if (task.status === "skipped") return fail("スキップ済みです。先に再開してください。");

    // 写真必須チェック（サーバー側）
    if (task.photo_requirement === "required") {
      const { count } = await supabase
        .from("cleaning_photos")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId);
      if (!count || count < 1) {
        return fail("この清掃は写真の登録が必須です。写真を1枚以上追加してください。");
      }
    }

    const { error } = await supabase
      .from("cleaning_tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by: me.id,
        comment: parsed.data.comment || null,
        actual_minutes: parsed.data.actualMinutes ?? null,
        was_overdue: task.was_overdue || task.status === "overdue",
      })
      .eq("id", taskId);
    if (error) return fail(error.message);
    await writeLog(supabase, task, "complete", "done", me.id, {
      comment: parsed.data.comment || null,
      actualMinutes: parsed.data.actualMinutes ?? null,
    });
    revalidateTaskViews(taskId);
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// ---------------------------------------------------------------------------
// スキップ（管理者）
// ---------------------------------------------------------------------------
export async function skipTaskAction(
  taskId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const me = await assertAdmin();
    const trimmed = reason.trim();
    if (!trimmed) return fail("スキップ理由を入力してください");
    const supabase = await createClient();
    const task = await loadTask(supabase, taskId);
    if (!task) return fail("タスクが見つかりません");

    const { error } = await supabase
      .from("cleaning_tasks")
      .update({ status: "skipped", skip_reason: trimmed })
      .eq("id", taskId);
    if (error) return fail(error.message);
    await writeLog(supabase, task, "skip", "skipped", me.id, { comment: trimmed });
    revalidateTaskViews(taskId);
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// ---------------------------------------------------------------------------
// 差戻し / 再開（管理者）: done/skipped → pending
// ---------------------------------------------------------------------------
export async function reopenTaskAction(taskId: string): Promise<ActionResult> {
  try {
    const me = await assertAdmin();
    const supabase = await createClient();
    const task = await loadTask(supabase, taskId);
    if (!task) return fail("タスクが見つかりません");
    if (task.status === "pending") return ok();

    const wasDone = task.status === "done";
    const { error } = await supabase
      .from("cleaning_tasks")
      .update({
        status: "pending",
        completed_at: null,
        completed_by: null,
        skip_reason: null,
      })
      .eq("id", taskId);
    if (error) return fail(error.message);
    await writeLog(
      supabase,
      task,
      wasDone ? "uncomplete" : "reopen",
      "pending",
      me.id,
    );
    revalidateTaskViews(taskId);
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// ---------------------------------------------------------------------------
// 写真の登録（アップロード自体はクライアントが Storage へ直接。ここは行の作成）
// ---------------------------------------------------------------------------
const attachSchema = z.object({
  taskId: z.string().uuid(),
  storagePath: z.string().min(1).max(400),
  bytes: z.number().int().min(0).max(20_000_000).nullable().optional(),
});

export async function attachPhotoAction(input: {
  taskId: string;
  storagePath: string;
  bytes?: number | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await assertMember();
    const parsed = attachSchema.safeParse(input);
    if (!parsed.success) return fail("写真情報が不正です");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cleaning_photos")
      .insert({
        task_id: parsed.data.taskId,
        storage_path: parsed.data.storagePath,
        uploaded_by: me.id,
        bytes: parsed.data.bytes ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return fail(`写真の登録に失敗しました: ${error?.message ?? ""}`);
    revalidateTaskViews(parsed.data.taskId);
    return ok({ id: String((data as { id: string }).id) });
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function deletePhotoAction(
  photoId: string,
  taskId: string,
): Promise<ActionResult> {
  try {
    await assertMember();
    const supabase = await createClient();
    const { data: photo } = await supabase
      .from("cleaning_photos")
      .select("storage_path")
      .eq("id", photoId)
      .maybeSingle();
    const { error } = await supabase.from("cleaning_photos").delete().eq("id", photoId);
    if (error) return fail(error.message);
    if (photo?.storage_path) {
      await supabase.storage
        .from("cleaning-photos")
        .remove([String((photo as { storage_path: string }).storage_path)]);
    }
    revalidateTaskViews(taskId);
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// ---------------------------------------------------------------------------
// 手動タスク追加（管理者）
// ---------------------------------------------------------------------------
const manualSchema = z.object({
  masterId: z.string().uuid(),
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeSlot: z.enum(TIME_SLOTS).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
});

export async function createManualTaskAction(input: {
  masterId: string;
  taskDate?: string;
  timeSlot?: string;
  assigneeId?: string | null;
  dueTime?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await assertAdmin();
    const parsed = manualSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const supabase = await createClient();

    const { data: m } = await supabase
      .from("cleaning_master")
      .select(
        "id, name, area_id, category_id, position, default_assignee_id, photo_requirement, priority, estimated_minutes, notes, " +
          "area:cleaning_areas!area_id(name), category:cleaning_categories!category_id(name)",
      )
      .eq("id", parsed.data.masterId)
      .maybeSingle();
    if (!m) return fail("清掃項目が見つかりません");
    const master = m as unknown as Record<string, unknown>;

    const taskDate = parsed.data.taskDate ?? jstDateString();
    const timeSlot = parsed.data.timeSlot ?? "open_hours";
    const store = await getStoreSettings();
    const dueTime = resolveDueTime(
      { dueTime: parsed.data.dueTime ?? null, timeSlot: timeSlot as never },
      store.timeSlots,
    );
    const dueAt = dueTime
      ? jstDateTimeToInstant(taskDate, dueTime).toISOString()
      : null;

    const areaName =
      (Array.isArray(master.area) ? (master.area[0] as { name?: string }) : (master.area as { name?: string } | null))
        ?.name ?? null;
    const categoryName =
      (Array.isArray(master.category)
        ? (master.category[0] as { name?: string })
        : (master.category as { name?: string } | null))?.name ?? null;

    const { data, error } = await supabase
      .from("cleaning_tasks")
      .insert({
        master_id: master.id,
        schedule_id: null,
        task_date: taskDate,
        master_name: master.name,
        area_id: master.area_id,
        area_label: areaName,
        category_id: master.category_id,
        category_label: categoryName,
        time_slot: timeSlot,
        due_at: dueAt,
        position: master.position,
        assignee_id: parsed.data.assigneeId ?? master.default_assignee_id ?? null,
        photo_requirement: master.photo_requirement ?? "optional",
        priority: master.priority ?? "normal",
        estimated_minutes: master.estimated_minutes,
        notes: master.notes,
        status: "pending",
        source: "manual",
        created_by: me.id,
      })
      .select("id")
      .single();
    if (error || !data) return fail(`追加に失敗しました: ${error?.message ?? ""}`);

    const created = data as { id: string };
    await supabase.from("cleaning_logs").insert({
      task_id: created.id,
      master_id: String(master.id),
      master_name: String(master.name),
      task_date: taskDate,
      action: "generate",
      status_after: "pending",
      actor_id: me.id,
      comment: "手動追加",
    });
    revalidatePath("/today");
    revalidatePath("/admin");
    return ok({ id: String(created.id) });
  } catch (e) {
    return fail(toMessage(e));
  }
}
