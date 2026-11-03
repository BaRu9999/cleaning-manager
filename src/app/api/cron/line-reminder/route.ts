/**
 * 未実施通知（期限前リマインド）＋ 期限超過通知（LINE・担当者本人へ）。
 * 実行: Vercel Cron "0,30 * * * *"（30分毎, 営業時間中）。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * 1. pending（未実施通知）: line_reminder_offsets（期限からの分。-30=30分前 等）ごとに、
 *    due_at ≈ now - offset の未着手タスクを担当者へ Flex（リーダー/店長にはまとめ）
 * 2. overdue（期限超過通知）: due_at < now の pending/in_progress を overdue に更新し、
 *    本日の overdue を担当者へ Flex（リーダー/店長にはまとめ）
 *
 * 重複は notification_logs（dedupe_key）で防止。
 * クエリ: dry=1 / date=YYYY-MM-DD
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getNotificationSettingsAdmin,
  getStoreSettingsAdmin,
} from "@/lib/data/settings";
import { dispatchDeadline } from "@/lib/line/dispatch";
import {
  authorizeCron,
  cronParams,
  loadTasksByIdsAdmin,
  unauthorized,
} from "@/lib/cron/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_MIN = 16; // Cron 30分間隔の半分 + マージン

async function handle(request: Request): Promise<Response> {
  if (!authorizeCron(request)) return unauthorized();
  const { date, dry } = cronParams(request);
  const now = Date.now();

  try {
    const admin = createAdminClient();
    const settings = await getNotificationSettingsAdmin();
    const store = await getStoreSettingsAdmin();

    // 期限超過へ遷移（LINE 無効でも実行）
    const { data: moved } = await admin
      .from("cleaning_tasks")
      .update({ status: "overdue" })
      .lt("due_at", new Date(now).toISOString())
      .in("status", ["pending", "in_progress"])
      .select("id");
    const movedToOverdue = moved?.length ?? 0;

    const pendingResults: unknown[] = [];
    let overdueResult: unknown = { skipped: "line_disabled" };

    if (settings.lineEnabled) {
      // 1. 未実施通知（offset ごと）
      for (const offset of settings.lineReminderOffsets) {
        const center = now - offset * 60_000; // due_at ≈ now - offset
        const from = new Date(center - WINDOW_MIN * 60_000).toISOString();
        const to = new Date(center + WINDOW_MIN * 60_000).toISOString();
        const { data: rows } = await admin
          .from("cleaning_tasks")
          .select("id")
          .eq("task_date", date)
          .gte("due_at", from)
          .lte("due_at", to)
          .in("status", ["pending", "in_progress"]);
        const ids = (rows ?? []).map((r) => String((r as { id: string }).id));
        const tasks = await loadTasksByIdsAdmin(admin, ids);
        const res = await dispatchDeadline({
          admin,
          settings,
          store,
          tasks,
          kind: "pending",
          date,
          offsetMinutes: offset,
          dry,
        });
        pendingResults.push({ offset, ...res });
      }

      // 2. 期限超過通知（本日分。重複は notification_logs で防止）
      const { data: overdueRows } = await admin
        .from("cleaning_tasks")
        .select("id")
        .eq("task_date", date)
        .eq("status", "overdue");
      const ids = (overdueRows ?? []).map((r) => String((r as { id: string }).id));
      const tasks = await loadTasksByIdsAdmin(admin, ids);
      overdueResult = await dispatchDeadline({
        admin,
        settings,
        store,
        tasks,
        kind: "overdue",
        date,
        dry,
      });
    }

    return NextResponse.json({
      ok: true,
      date,
      dry,
      movedToOverdue,
      pending: pendingResults,
      overdue: overdueResult,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
