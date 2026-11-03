"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertMember } from "@/lib/auth/guard";
import { fail, ok, toMessage, type ActionResult } from "./result";

/** 本人の LINE 連携を解除（staff_line_accounts の行を削除） */
export async function unlinkMyLineAction(): Promise<ActionResult> {
  try {
    const me = await assertMember();
    const supabase = await createClient();
    // RLS: staff_line_accounts_write は staff_id = auth.uid() を許可
    const { error } = await supabase
      .from("staff_line_accounts")
      .delete()
      .eq("staff_id", me.id);
    if (error) return fail(error.message);
    revalidatePath("/profile");
    revalidatePath("/admin/staff");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
