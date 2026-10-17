/**
 * 閉店後の「本日の清掃結果」通知。
 *  - Slack（店舗全体 / 1チャンネル）
 *  - LINE（admin_report を受信する役職＝店長・清掃リーダー 等）
 * 実行: Vercel Cron "0 14 * * *"（= JST 23:00）。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * クエリ: dry=1 / force=1 / date=YYYY-MM-DD / at=HH:MM
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getNotificationSettingsAdmin,
  getStoreSettingsAdmin,
} from "@/lib/data/settings";
import { getSiteUrl } from "@/lib/env";
import { jstTimeString } from "@/lib/date/jst";
import { summarizeProgress } from "@/lib/cleaning/progress";
import { buildClosingSummaryMessage } from "@/lib/slack/messages";
import { postToSlackWebhook } from "@/lib/slack/notify";
import { dispatchClosing } from "@/lib/line/dispatch";
import {
  authorizeCron,
  cronParams,
  loadDateTasksAdmin,
  unauthorized,
} from "@/lib/cron/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

async function handle(request: Request): Promise<Response> {
  if (!authorizeCron(request)) return unauthorized();
  const { date, dry, force } = cronParams(request);
  const nowHHMM = new URL(request.url).searchParams.get("at") ?? jstTimeString();

  try {
    const admin = createAdminClient();
    const settings = await getNotificationSettingsAdmin();
    const store = await getStoreSettingsAdmin();

    const slackWanted =
      settings.slackEnabled && settings.notifyClosingSummary && !!settings.slackWebhookUrl;
    const lineWanted =
      settings.lineEnabled &&
      (force || Math.abs(toMin(nowHHMM) - toMin(settings.lineClosingTime)) <= 30);

    if (!slackWanted && !lineWanted) {
      return NextResponse.json({ ok: true, skipped: "disabled", date });
    }

    const tasks = await loadDateTasksAdmin(admin, date);
    const summary = summarizeProgress(tasks);

    // --- Slack ---
    let slackResult: unknown = { skipped: "disabled" };
    if (slackWanted && (force || dry || settings.lastClosingSummaryOn !== date)) {
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
        await postToSlackWebhook(settings.slackWebhookUrl!, message);
        await admin
          .from("cleaning_notification_settings")
          .update({ last_closing_summary_on: date })
          .eq("id", 1);
      }
      slackResult = { sent: !dry };
    }

    // --- LINE（admin_report） ---
    let lineResult: unknown = { skipped: "not_scheduled" };
    if (lineWanted && (force || dry || settings.lastLineClosingOn !== date)) {
      lineResult = await dispatchClosing({ admin, settings, store, tasks, date, dry });
      if (!dry) {
        await admin
          .from("notification_settings")
          .update({ last_line_closing_on: date })
          .eq("id", 1);
      }
    }

    return NextResponse.json({
      ok: true,
      date,
      planned: summary.planned,
      done: summary.done,
      dry,
      slack: slackResult,
      line: lineResult,
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
