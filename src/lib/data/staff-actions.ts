"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin, assertMember } from "@/lib/auth/guard";
import { ROLES } from "@/config/constants";
import { fail, ok, toMessage, type ActionResult } from "./result";

export async function setStaffActiveAction(
  userId: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const me = await assertAdmin();
    if (userId === me.id && !active) {
      return fail("自分自身を無効化することはできません");
    }
    const supabase = await createClient();
    const { error } = await supabase.from("users").update({ active }).eq("id", userId);
    if (error) return fail(error.message);
    revalidatePath("/admin/staff");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function setStaffRoleAction(
  userId: string,
  role: string,
): Promise<ActionResult> {
  try {
    const me = await assertAdmin();
    if (!(ROLES as readonly string[]).includes(role)) return fail("不正なロールです");
    if (userId === me.id && role !== "admin") {
      return fail("自分の権限は変更できません（他の管理者に依頼してください）");
    }
    const supabase = await createClient();
    const { error } = await supabase.from("users").update({ role }).eq("id", userId);
    if (error) return fail(error.message);
    revalidatePath("/admin/staff");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function setStaffPositionAction(
  userId: string,
  position: string,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({ position: position.trim() || null })
      .eq("id", userId);
    if (error) return fail(error.message);
    revalidatePath("/admin/staff");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "表示名は必須です").max(60),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

/** 本人によるプロフィール更新（表示名・電話）。ロール・在籍は変更不可（トリガーで保護） */
export async function updateMyProfileAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const me = await assertMember();
    const parsed = profileSchema.safeParse({
      displayName: formData.get("displayName"),
      phone: formData.get("phone") ?? "",
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({ display_name: parsed.data.displayName, phone: parsed.data.phone })
      .eq("id", me.id);
    if (error) return fail(error.message);
    revalidatePath("/profile");
    revalidatePath("/admin/staff");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
