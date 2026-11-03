/**
 * Cron ルート共通処理。
 * 認証は Authorization: Bearer ${CRON_SECRET}。未設定・不一致は 401。
 * Vercel Cron は CRON_SECRET を設定すると自動で Authorization ヘッダを付与する。
 */

import { NextResponse } from "next/server";
import { getCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { jstDateString } from "@/lib/date/jst";
import { slotOrder } from "@/lib/cleaning/slots";
import { mapTask } from "@/lib/data/mappers";
import type { CleaningTask } from "@/lib/types/domain";

export function authorizeCron(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  // Vercel Cron の Bearer、または手動テスト用に ?key= も許可
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("key") === secret;
}

export function unauthorized(): Response {
  return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
}

export interface CronParams {
  dry: boolean;
  force: boolean;
  date: string;
}

export function cronParams(request: Request): CronParams {
  const url = new URL(request.url);
  const rawDate = url.searchParams.get("date");
  const date =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : jstDateString();
  return {
    dry: url.searchParams.get("dry") === "1",
    force: url.searchParams.get("force") === "1",
    date,
  };
}

const TASK_SELECT =
  "*, assignee:users!assignee_id(display_name), " +
  "completed_by_user:users!completed_by(display_name), " +
  "started_by_user:users!started_by(display_name), " +
  "cleaning_photos(count)";

/** service_role で指定日のタスクを取得（Cron 専用） */
export async function loadDateTasksAdmin(
  admin: ReturnType<typeof createAdminClient>,
  date: string,
): Promise<CleaningTask[]> {
  const { data, error } = await admin
    .from("cleaning_tasks")
    .select(TASK_SELECT)
    .eq("task_date", date);
  if (error) throw new Error(`タスク取得に失敗: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map(mapTask)
    .sort((a, b) => slotOrder(a.timeSlot) - slotOrder(b.timeSlot));
}

/** service_role で ID 指定のタスクを取得（Cron 専用） */
export async function loadTasksByIdsAdmin(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<CleaningTask[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from("cleaning_tasks")
    .select(TASK_SELECT)
    .in("id", ids);
  if (error) throw new Error(`タスク取得に失敗: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapTask);
}
