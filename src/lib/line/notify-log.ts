/**
 * notification_logs による二重送信防止。
 * dedupe_key に UNIQUE 制約があるため、INSERT が成功したら「初回」、
 * 競合したら「送信済み」。送信の直前に claim し、失敗時は status を更新する。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface NotifyLogMeta {
  notificationType: string;
  cleaningTaskId?: string | null;
  staffId?: string | null;
  lineUserId?: string | null;
}

/**
 * dedupe_key を予約する。true=初回（送ってよい） / false=送信済み。
 * まず status='skipped' で入れ、送信できたら 'sent' に更新する使い方でも良いが、
 * ここでは呼び出し側が送信後に markSent / markFailed を呼ぶ前提で 'sent' 予約する。
 */
export async function claimNotification(
  admin: SupabaseClient,
  dedupeKey: string,
  meta: NotifyLogMeta,
): Promise<{ claimed: boolean; logId: string | null }> {
  const { data, error } = await admin
    .from("notification_logs")
    .insert({
      dedupe_key: dedupeKey,
      notification_type: meta.notificationType,
      cleaning_task_id: meta.cleaningTaskId ?? null,
      staff_id: meta.staffId ?? null,
      line_user_id: meta.lineUserId ?? null,
      status: "sent",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation → 既に送信済み
    if ((error as { code?: string }).code === "23505") {
      return { claimed: false, logId: null };
    }
    throw new Error(`notification_logs の書き込みに失敗: ${error.message}`);
  }
  return { claimed: true, logId: data ? String((data as { id: string }).id) : null };
}

export async function markNotificationResult(
  admin: SupabaseClient,
  logId: string | null,
  result: {
    status: "sent" | "failed";
    lineRequestId?: string | null;
    errorMessage?: string | null;
    /** true のとき失敗ログを残さず削除 → 次の Cron で再送を許可 */
    retryable?: boolean;
  },
): Promise<void> {
  if (!logId) return;
  if (result.status === "failed" && result.retryable) {
    await admin.from("notification_logs").delete().eq("id", logId);
    return;
  }
  await admin
    .from("notification_logs")
    .update({
      status: result.status,
      line_request_id: result.lineRequestId ?? null,
      error_message: result.errorMessage ?? null,
    })
    .eq("id", logId);
}
