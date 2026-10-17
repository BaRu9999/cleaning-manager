import { createClient } from "@/lib/supabase/server";
import { jstDateString } from "@/lib/date/jst";
import { mapDailyStaffing } from "./mappers";
import type { DailyStaffing } from "@/lib/types/domain";

const SELECT = "*, user:users!user_id(display_name)";

export async function getDailyStaffing(date: string = jstDateString()): Promise<DailyStaffing[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_staffing")
    .select(SELECT)
    .eq("work_date", date);
  if (error) throw new Error(`出勤スタッフの取得に失敗しました: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map(mapDailyStaffing)
    .sort((a, b) => a.userName.localeCompare(b.userName, "ja"));
}

/** 清掃対応可の出勤者のみ（自動割当の母集団） */
export async function getAvailableStaffToday(
  date: string = jstDateString(),
): Promise<DailyStaffing[]> {
  const all = await getDailyStaffing(date);
  return all.filter((s) => s.availableForCleaning);
}
