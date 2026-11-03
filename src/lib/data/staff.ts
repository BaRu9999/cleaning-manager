import { createClient } from "@/lib/supabase/server";
import { jstDateString } from "@/lib/date/jst";
import { mapUserProfile } from "./mappers";
import type { UserProfile } from "@/lib/types/domain";

const STAFF_SELECT =
  "*, line_account:staff_line_accounts!staff_id(line_user_id, is_active, line_display_name)";

/** 全ユーザー（管理者向け。非アクティブ含む）。承認待ちを先頭に、表示名順。 */
export async function listStaff(): Promise<UserProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select(STAFF_SELECT)
    .order("active", { ascending: true })
    .order("display_name");
  if (error) throw new Error(`スタッフ一覧の取得に失敗しました: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapUserProfile);
}

export interface AssignmentCount {
  assigned: number;
  done: number;
}

/** 本日の担当件数 / 完了件数（staff_id ごと） */
export async function getTodayAssignmentCounts(): Promise<Map<string, AssignmentCount>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_tasks")
    .select("assignee_id, status")
    .eq("task_date", jstDateString());
  if (error) throw new Error(`担当件数の取得に失敗しました: ${error.message}`);

  const map = new Map<string, AssignmentCount>();
  for (const r of (data ?? []) as { assignee_id: string | null; status: string }[]) {
    if (!r.assignee_id) continue;
    const c = map.get(r.assignee_id) ?? { assigned: 0, done: 0 };
    if (r.status !== "skipped") c.assigned += 1;
    if (r.status === "done") c.done += 1;
    map.set(r.assignee_id, c);
  }
  return map;
}
