import { createClient } from "@/lib/supabase/server";
import { mapUserProfile } from "./mappers";
import type { UserProfile } from "@/lib/types/domain";

/** 全ユーザー（管理者向け。非アクティブ含む）。表示名順、承認待ちを先頭に。 */
export async function listStaff(): Promise<UserProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("active", { ascending: true })
    .order("display_name");
  if (error) throw new Error(`スタッフ一覧の取得に失敗しました: ${error.message}`);
  return (data ?? []).map((r) => mapUserProfile(r as Record<string, unknown>));
}
