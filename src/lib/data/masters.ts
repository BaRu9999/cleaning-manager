import { createClient } from "@/lib/supabase/server";
import {
  mapArea,
  mapCategory,
  mapMaster,
  mapUserProfile,
} from "./mappers";
import type {
  CleaningArea,
  CleaningCategory,
  CleaningMaster,
  UserProfile,
} from "@/lib/types/domain";

const MASTER_SELECT =
  "*, area:cleaning_areas!area_id(name), category:cleaning_categories!category_id(name), " +
  "assignee:users!default_assignee_id(display_name), " +
  "schedules:cleaning_schedules(*)";

export async function listCategories(
  opts: { includeInactive?: boolean } = {},
): Promise<CleaningCategory[]> {
  const supabase = await createClient();
  let q = supabase.from("cleaning_categories").select("*");
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q.order("sort_order").order("name");
  if (error) throw new Error(`カテゴリー取得に失敗しました: ${error.message}`);
  return (data ?? []).map((r) => mapCategory(r as Record<string, unknown>));
}

export async function listAreas(
  opts: { includeInactive?: boolean } = {},
): Promise<CleaningArea[]> {
  const supabase = await createClient();
  let q = supabase
    .from("cleaning_areas")
    .select("*, category:cleaning_categories!category_id(name)");
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q.order("sort_order").order("name");
  if (error) throw new Error(`清掃場所の取得に失敗しました: ${error.message}`);
  return (data ?? []).map((r) => mapArea(r as Record<string, unknown>));
}

export async function listMasters(
  opts: { includeInactive?: boolean } = {},
): Promise<CleaningMaster[]> {
  const supabase = await createClient();
  let q = supabase.from("cleaning_master").select(MASTER_SELECT);
  if (!opts.includeInactive) q = q.eq("active", true);
  const { data, error } = await q.order("name");
  if (error) throw new Error(`清掃項目の取得に失敗しました: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapMaster);
}

export async function getMaster(id: string): Promise<CleaningMaster | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_master")
    .select(MASTER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`清掃項目の取得に失敗しました: ${error.message}`);
  return data ? mapMaster(data as unknown as Record<string, unknown>) : null;
}

/** 担当スタッフ候補（在籍中） */
export async function listAssignableUsers(): Promise<UserProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("active", true)
    .order("display_name");
  if (error) throw new Error(`スタッフ一覧の取得に失敗しました: ${error.message}`);
  return (data ?? []).map((r) => mapUserProfile(r as Record<string, unknown>));
}
