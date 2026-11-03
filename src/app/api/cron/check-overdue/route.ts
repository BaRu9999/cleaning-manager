/**
 * 期限超過チェック + 未実施 Slack 通知（店舗全体 / 1チャンネル）。
 * 実行: Vercel Cron "0,30 * * * *"（30分毎）。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * 担当者本人への LINE リマインド/超過通知は /api/cron/line-reminder が担当。
 *
 * 1. status が pending/in_progress かつ due_at < now() のタスクを overdue に更新
 * 2. Slack 有効かつ notify_overdue のとき、未通知（overdue_notified_at is null）の
 *    overdue をまとめて投稿し、overdue_notified_at を打つ
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationSettingsAdmin } from "@/lib/data/settings";
import { formatTimeJst } from "@/lib/date/jst";
import { buildOverdueDigestMessage } from "@/lib/slack/messages";
import { postToSlackWebhook } from "@/lib/slack/notify";
import { authorizeCron, cronParams, unauthorized } from "@/lib/cron/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface OverdueRow {
  id: string;
  master_name: string;
  due_at: string | null;
  fixed_time: string | null;
  position: string | null;
  assignee: { display_name: string } | { display_name: string }[] | null;
}

async function handle(request: Request): Promise<Response> {
  if (!authorizeCron(request)) return unauthorized();
  const { dry } = cronParams(request);
  const nowIso = new Date().toISOString();

  try {
    const admin = createAdminClient();

    const { data: transitioned, error: upErr } = await admin
      .from("cleaning_tasks")
      .update({ status: "overdue" })
      .lt("due_at", nowIso)
      .in("status", ["pending", "in_progress"])
      .select("id");
    if (upErr) throw new Error(`overdue 更新に失敗: ${upErr.message}`);
    const movedToOverdue = transitioned?.length ?? 0;

    const settings = await getNotificationSettingsAdmin();
    let notified = 0;
    if (
      !dry &&
      settings.slackEnabled &&
      settings.notifyOverdue &&
      settings.slackWebhookUrl
    ) {
      const { data: pendingNotify } = await admin
        .from("cleaning_tasks")
        .select(
          "id, master_name, due_at, fixed_time, position, assignee:users!assignee_id(display_name)",
        )
        .eq("status", "overdue")
        .is("overdue_notified_at", null)
        .order("due_at", { ascending: true });

      const rows = (pendingNotify ?? []) as unknown as OverdueRow[];
      if (rows.length > 0) {
        const items = rows.map((r) => {
          const a = Array.isArray(r.assignee) ? r.assignee[0] : r.assignee;
          return {
            masterName: r.master_name,
            timeLabel: r.fixed_time?.slice(0, 5) || formatTimeJst(r.due_at) || "未設定",
            who: a?.display_name || r.position || "指定なし",
          };
        });
        await postToSlackWebhook(
          settings.slackWebhookUrl,
          buildOverdueDigestMessage({ items }),
        );
        await admin
          .from("cleaning_tasks")
          .update({ overdue_notified_at: nowIso })
          .in("id", rows.map((r) => r.id));
        notified = rows.length;
      }
    }

    return NextResponse.json({ ok: true, movedToOverdue, notified, dry });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
