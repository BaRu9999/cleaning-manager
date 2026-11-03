"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { fail, ok, toMessage, type ActionResult } from "./result";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const entrySchema = z.object({
  userId: z.string().uuid(),
  positions: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  startTime: z.string().regex(HHMM).nullable().default(null),
  endTime: z.string().regex(HHMM).nullable().default(null),
  availableForCleaning: z.boolean().default(true),
});

const paramsSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(entrySchema).max(200),
});

export interface StaffingEntryInput {
  userId: string;
  positions: string[];
  startTime: string | null;
  endTime: string | null;
  availableForCleaning: boolean;
}

/**
 * 指定日の daily_staffing を entries で全置換する共通処理。
 * 手動編集（チェックリスト保存）とシフトCSV取込の両方から使う。
 */
export async function replaceDailyStaffingForDate(
  supabase: SupabaseClient,
  workDate: string,
  entries: StaffingEntryInput[],
): Promise<{ error: string | null }> {
  const keepIds = entries.map((e) => e.userId);

  let delQuery = supabase.from("daily_staffing").delete().eq("work_date", workDate);
  delQuery = keepIds.length > 0 ? delQuery.not("user_id", "in", `(${keepIds.join(",")})`) : delQuery;
  const { error: delErr } = await delQuery;
  if (delErr) return { error: `更新に失敗しました: ${delErr.message}` };

  if (entries.length > 0) {
    const rows = entries.map((e) => ({
      work_date: workDate,
      user_id: e.userId,
      position: e.positions[0] ?? null,
      positions: e.positions,
      start_time: e.startTime,
      end_time: e.endTime,
      available_for_cleaning: e.availableForCleaning,
    }));
    const { error: upErr } = await supabase
      .from("daily_staffing")
      .upsert(rows, { onConflict: "work_date,user_id" });
    if (upErr) return { error: `保存に失敗しました: ${upErr.message}` };
  }
  return { error: null };
}

/**
 * 本日の出勤スタッフを保存する（全置換）。
 * entries に含まれない在籍スタッフの当日行は削除する（＝「出勤なし」扱い）。
 */
export async function setDailyStaffingAction(
  payloadJson: string,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    let raw: unknown;
    try {
      raw = JSON.parse(payloadJson);
    } catch {
      return fail("入力データの形式が不正です");
    }
    const parsed = paramsSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const { workDate, entries } = parsed.data;

    const supabase = await createClient();
    const { error } = await replaceDailyStaffingForDate(supabase, workDate, entries);
    if (error) return fail(error);

    revalidatePath("/admin/assignments");
    revalidatePath("/admin");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
