"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { fail, ok, toMessage, type ActionResult } from "./result";

const schema = z.object({
  masterId: z.string().uuid(),
  minutes: z.number().int().min(1).max(600),
});

/**
 * 分析画面の「推奨時間を適用」。cleaning_master.estimated_minutes を更新する。
 * 自動更新は行わず、必ず管理者がこのアクションを明示的に呼んだ場合のみ変更する。
 */
export async function applyRecommendedEstimateAction(
  masterId: string,
  minutes: number,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = schema.safeParse({ masterId, minutes });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");

    const supabase = await createClient();
    const { error } = await supabase
      .from("cleaning_master")
      .update({ estimated_minutes: parsed.data.minutes })
      .eq("id", parsed.data.masterId);
    if (error) return fail(`更新に失敗しました: ${error.message}`);

    revalidatePath("/admin/analysis/time");
    revalidatePath("/admin/master");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
