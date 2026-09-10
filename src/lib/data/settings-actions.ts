"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { DEFAULT_TIME_SLOTS, TIME_SLOTS } from "@/config/constants";
import { fail, ok, toMessage, type ActionResult } from "./result";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const timeSlotSchema = z.object({
  key: z.enum(TIME_SLOTS),
  label: z.string().trim().min(1).max(20),
  start: z.string().regex(HHMM).nullable(),
  end: z.string().regex(HHMM).nullable(),
});

const schema = z.object({
  storeName: z.string().trim().min(1, "店名は必須です").max(60),
  openTime: z.string().regex(HHMM, "開店時刻の形式が不正です"),
  closeTime: z.string().regex(HHMM, "閉店時刻の形式が不正です"),
  timeSlots: z.array(timeSlotSchema).max(8).default([]),
  positions: z
    .array(z.string().trim().min(1).max(30))
    .min(1, "ポジションを1つ以上入力してください")
    .max(20),
});

export async function updateStoreSettingsAction(
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
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const d = parsed.data;

    // 8つの時間帯キーを常に維持（不足分は既定値で補完）
    const merged = DEFAULT_TIME_SLOTS.map((def) => {
      const found = d.timeSlots.find((s) => s.key === def.key);
      return found ?? def;
    });

    const supabase = await createClient();
    const { error } = await supabase
      .from("store_settings")
      .update({
        store_name: d.storeName,
        open_time: d.openTime,
        close_time: d.closeTime,
        time_slots: merged,
        positions: [...new Set(d.positions.map((p) => p.trim()).filter(Boolean))],
      })
      .eq("id", 1);
    if (error) return fail(`保存に失敗しました: ${error.message}`);

    revalidatePath("/admin/settings");
    revalidatePath("/today");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
