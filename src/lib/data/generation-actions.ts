"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { jstDateString } from "@/lib/date/jst";
import { runGeneration } from "@/lib/cleaning/run-generation";
import { getStoreSettings } from "./settings";
import { fail, ok, toMessage, type ActionResult } from "./result";

/** 管理者が「本日分（または指定日）のタスクを生成し直す」。冪等。 */
export async function regenerateTasksAction(
  date?: string,
): Promise<ActionResult<{ planned: number; inserted: number }>> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const store = await getStoreSettings();
    const target = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : jstDateString();
    const res = await runGeneration(supabase, target, store.timeSlots);
    revalidatePath("/today");
    revalidatePath("/admin");
    revalidatePath("/admin/calendar");
    return ok({ planned: res.planned, inserted: res.inserted });
  } catch (e) {
    return fail(toMessage(e));
  }
}
