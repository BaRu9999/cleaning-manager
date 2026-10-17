import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET } from "@/config/constants";
import { mapEquipmentIssue } from "./mappers";
import type { EquipmentIssue, EquipmentStatus } from "@/lib/types/domain";

const SELECT =
  "*, reporter:users!reported_by(display_name), resolver:users!resolved_by(display_name), " +
  "master:cleaning_master!master_id(name), area:cleaning_areas!area_id(name)";

export async function listEquipmentIssues(
  filter: { status?: EquipmentStatus } = {},
): Promise<EquipmentIssue[]> {
  const supabase = await createClient();
  let q = supabase.from("equipment_issues").select(SELECT);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("reported_at", { ascending: false });
  if (error) throw new Error(`設備異常の取得に失敗しました: ${error.message}`);

  const issues = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapEquipmentIssue);
  const withPhoto = issues.filter((i) => i.photoPath);
  if (withPhoto.length === 0) return issues;

  const { data: signed } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(withPhoto.map((i) => i.photoPath!), 60 * 60);
  const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? null]));
  return issues.map((i) =>
    i.photoPath ? { ...i, photoSignedUrl: urlByPath.get(i.photoPath) ?? null } : i,
  );
}

export async function getEquipmentIssueOpenCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("equipment_issues")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"]);
  if (error) throw new Error(`設備異常件数の取得に失敗しました: ${error.message}`);
  return count ?? 0;
}
