/**
 * staff_line_accounts のデータ操作（service_role 前提。LIFF / Webhook / Cron から使用）。
 * RLS を跨ぐため必ずサーバーの信頼済みコンテキストから呼ぶこと。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface LinkedStaff {
  staffId: string;
  displayName: string;
  jobTitle: string;
  position: string | null;
  active: boolean;
  lineUserId: string;
}

/** line_user_id から連携中スタッフを解決（is_active のみ） */
export async function resolveStaffByLineUserId(
  admin: SupabaseClient,
  lineUserId: string,
): Promise<LinkedStaff | null> {
  const { data } = await admin
    .from("staff_line_accounts")
    .select("line_user_id, is_active, staff:users!staff_id(id, display_name, job_title, position, active)")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (!data || (data as Record<string, unknown>).is_active === false) return null;
  const s = (data as Record<string, unknown>).staff as Record<string, unknown> | null;
  const staff = Array.isArray(s) ? (s[0] as Record<string, unknown>) : s;
  if (!staff) return null;
  return {
    staffId: String(staff.id),
    displayName: String(staff.display_name ?? ""),
    jobTitle: String(staff.job_title ?? "staff"),
    position: (staff.position as string | null) ?? null,
    active: staff.active !== false,
    lineUserId,
  };
}

export interface LinkResult {
  ok: boolean;
  error?: string;
}

/**
 * LINE アカウントとスタッフを紐付ける（1 LINE ↔ 1 staff）。
 * 既に別スタッフに使われている line_user_id はエラー。
 * 対象スタッフに別の LINE が紐付いていれば付け替える。
 */
export async function linkStaffLineAccount(
  admin: SupabaseClient,
  input: { lineUserId: string; staffId: string; lineDisplayName: string | null },
): Promise<LinkResult> {
  const { lineUserId, staffId, lineDisplayName } = input;

  const { data: byLine } = await admin
    .from("staff_line_accounts")
    .select("id, staff_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (byLine && String((byLine as { staff_id: string }).staff_id) !== staffId) {
    return { ok: false, error: "この LINE アカウントは既に別のスタッフに連携されています。" };
  }

  // 対象スタッフの既存行（別 line_user_id かもしれない）を掃除
  await admin.from("staff_line_accounts").delete().eq("staff_id", staffId).neq("line_user_id", lineUserId);

  const { error } = await admin.from("staff_line_accounts").upsert(
    {
      staff_id: staffId,
      line_user_id: lineUserId,
      line_display_name: lineDisplayName,
      is_active: true,
      blocked_at: null,
      registered_at: new Date().toISOString(),
    },
    { onConflict: "line_user_id" },
  );
  if (error) return { ok: false, error: `連携に失敗しました: ${error.message}` };
  return { ok: true };
}

/** unfollow（ブロック）時: is_active=false / blocked_at のみ。行は消さない。 */
export async function deactivateLineAccount(
  admin: SupabaseClient,
  lineUserId: string,
): Promise<void> {
  await admin
    .from("staff_line_accounts")
    .update({ is_active: false, blocked_at: new Date().toISOString() })
    .eq("line_user_id", lineUserId);
}

/** 再フォロー時: is_active=true / blocked_at=null */
export async function reactivateLineAccount(
  admin: SupabaseClient,
  lineUserId: string,
  lineDisplayName: string | null,
): Promise<void> {
  await admin
    .from("staff_line_accounts")
    .update({
      is_active: true,
      blocked_at: null,
      line_display_name: lineDisplayName ?? undefined,
    })
    .eq("line_user_id", lineUserId);
}
