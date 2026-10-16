/**
 * 「本日の清掃結果」を Slack へ投稿する Cron。
 * 実行: Vercel Cron "0 14 * * *"（= JST 23:00）。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * クエリ: dry=1 / force=1 / date=YYYY-MM-DD
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationSettingsAdmin } from "@/lib/data/settings";
import { getSiteUrl } from "@/lib/env";
import { summarizeProgress } from "@/lib/cleaning/progress";
import { buildClosingSummaryMessage } from "@/lib/slack/messages";
import { postToSlackWebhook } from "@/lib/slack/notify";
import {
  authorizeCron,
  cronParams,
  loadDateTasksAdmin,
  unauthorized,
} from "@/lib/cron/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  if (!authorizeCron(request)) return unauthorized();
  const { date, dry, force } = cronParams(request);

  try {
    const admin = createAdminClient();
    const settings = await getNotificationSettingsAdmin();

    if (
      !settings.slackEnabled ||
      !settings.notifyClosingSummary ||
      !settings.slackWebhookUrl
    ) {
      return NextResponse.json({ ok: true, skipped: "disabled", date });
    }
    if (!force && settings.lastClosingSummaryOn === date) {
      return NextResponse.json({ ok: true, skipped: "already_posted", date });
    }

    const tasks = await loadDateTasksAdmin(admin, date);
    const summary = summarizeProgress(tasks);
    const missedNames = tasks
      .filter((t) => t.status !== "done" && t.status !== "skipped")
      .map((t) => t.masterName);

    const message = buildClosingSummaryMessage({
      date,
      planned: summary.planned,
      done: summary.done,
      missed: summary.planned - summary.done,
      missedNames,
      appUrl: getSiteUrl(),
    });

    if (!dry) {
      await postToSlackWebhook(settings.slackWebhookUrl, message);
      await admin
        .from("cleaning_notification_settings")
        .update({ last_closing_summary_on: date })
        .eq("id", 1);
    }

    return NextResponse.json({
      ok: true,
      date,
      planned: summary.planned,
      done: summary.done,
      dry,
      text: message.text,
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
