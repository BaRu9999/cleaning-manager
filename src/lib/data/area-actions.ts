"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { fail, ok, toMessage, type ActionResult } from "./result";

const categorySchema = z.object({
  name: z.string().trim().min(1, "名称は必須です").max(40),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

const areaSchema = z.object({
  categoryId: z.string().uuid("カテゴリーを選択してください"),
  name: z.string().trim().min(1, "名称は必須です").max(60),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

function bool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}

export async function saveCategoryAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = categorySchema.safeParse({
      name: formData.get("name"),
      sortOrder: formData.get("sortOrder") ?? 0,
      active: bool(formData.get("active")),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const supabase = await createClient();
    const row = {
      name: parsed.data.name,
      sort_order: parsed.data.sortOrder,
      active: parsed.data.active,
    };
    const { error } = id
      ? await supabase.from("cleaning_categories").update(row).eq("id", id)
      : await supabase.from("cleaning_categories").insert(row);
    if (error) {
      return fail(
        error.code === "23505"
          ? "同名のカテゴリーが既にあります"
          : `保存に失敗しました: ${error.message}`,
      );
    }
    revalidatePath("/admin/areas");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("cleaning_categories").delete().eq("id", id);
    if (error) {
      return fail(
        error.code === "23503"
          ? "このカテゴリーに属する清掃場所があるため削除できません。先に場所を移動・削除してください。"
          : `削除に失敗しました: ${error.message}`,
      );
    }
    revalidatePath("/admin/areas");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function saveAreaAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = areaSchema.safeParse({
      categoryId: formData.get("categoryId"),
      name: formData.get("name"),
      sortOrder: formData.get("sortOrder") ?? 0,
      active: bool(formData.get("active")),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const supabase = await createClient();
    const row = {
      category_id: parsed.data.categoryId,
      name: parsed.data.name,
      sort_order: parsed.data.sortOrder,
      active: parsed.data.active,
    };
    const { error } = id
      ? await supabase.from("cleaning_areas").update(row).eq("id", id)
      : await supabase.from("cleaning_areas").insert(row);
    if (error) {
      return fail(
        error.code === "23505"
          ? "このカテゴリーに同名の場所が既にあります"
          : `保存に失敗しました: ${error.message}`,
      );
    }
    revalidatePath("/admin/areas");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function deleteAreaAction(id: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from("cleaning_areas").delete().eq("id", id);
    if (error) return fail(`削除に失敗しました: ${error.message}`);
    revalidatePath("/admin/areas");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
