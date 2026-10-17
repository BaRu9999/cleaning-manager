"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin, assertMember } from "@/lib/auth/guard";
import { EQUIPMENT_SEVERITIES } from "@/config/constants";
import { fail, ok, toMessage, type ActionResult } from "./result";

const reportSchema = z.object({
  taskId: z.string().uuid().nullable().default(null),
  masterId: z.string().uuid().nullable().default(null),
  areaId: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1, "内容を入力してください").max(120),
  description: z.string().trim().max(2000).nullable().default(null),
  severity: z.enum(EQUIPMENT_SEVERITIES).default("medium"),
  photoPath: z.string().trim().max(400).nullable().default(null),
});

function revalidate() {
  revalidatePath("/admin/equipment-issues");
  revalidatePath("/admin");
}

/** スタッフ・管理者どちらも報告できる */
export async function reportEquipmentIssueAction(
  payloadJson: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await assertMember();
    let raw: unknown;
    try {
      raw = JSON.parse(payloadJson);
    } catch {
      return fail("入力データの形式が不正です");
    }
    const parsed = reportSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const d = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("equipment_issues")
      .insert({
        reported_by: me.id,
        task_id: d.taskId,
        master_id: d.masterId,
        area_id: d.areaId,
        title: d.title,
        description: d.description,
        severity: d.severity,
        photo_path: d.photoPath,
      })
      .select("id")
      .single();
    if (error || !data) return fail(`報告に失敗しました: ${error?.message ?? ""}`);

    revalidate();
    return ok({ id: String((data as { id: string }).id) });
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function startEquipmentIssueAction(id: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("equipment_issues")
      .update({ status: "in_progress" })
      .eq("id", id);
    if (error) return fail(error.message);
    revalidate();
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function resolveEquipmentIssueAction(
  id: string,
  note: string,
): Promise<ActionResult> {
  try {
    const me = await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("equipment_issues")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: me.id,
        resolution_note: note.trim() || null,
      })
      .eq("id", id);
    if (error) return fail(error.message);
    revalidate();
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
