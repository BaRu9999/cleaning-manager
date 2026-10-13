/**
 * 「本日の清掃予定」を Slack へ投稿する Cron。
 * 実行: Vercel Cron "0 23 * * *"（= JST 08:00）。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * クエリ: dry=1（送信しない） / force=1（二重送信ガード無視） / date=YYYY-MM-DD
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getNotificationSettingsAdmin,
  getStoreSettingsAdmin,
} from "@/lib/data/settings";
import { getSiteUrl } from "@/lib/env";
import { runGeneration } from "@/lib/cleaning/run-generation";
import { groupBySlot, slotLabel } from "@/lib/cleaning/slots";
import { buildDailyPlanMessage } from "@/lib/slack/messages";
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

    if (!settings.slackEnabled || !settings.notifyDailyPlan || !settings.slackWebhookUrl) {
      return NextResponse.json({ ok: true, skipped: "disabled", date });
    }
    if (!force && settings.lastDailyPlanOn === date) {
      return NextResponse.json({ ok: true, skipped: "already_posted", date });
    }

    const store = await getStoreSettingsAdmin();
    // 00:05 の生成が失敗していても 8:00 で埋める（冪等）
    await runGeneration(admin, date, store.timeSlots).catch(() => undefined);
    const tasks = (await loadDateTasksAdmin(admin, date)).filter(
      (t) => t.status !== "skipped",
    );

    const slots = groupBySlot(tasks).map((g) => ({
      label: slotLabel(g.key, store.timeSlots),
      names: g.items.map((t) => t.masterName),
    }));
    const message = buildDailyPlanMessage({
      date,
      total: tasks.length,
      slots,
      appUrl: getSiteUrl(),
    });

    if (!dry) {
      await postToSlackWebhook(settings.slackWebhookUrl, message);
      await admin
        .from("cleaning_notification_settings")
        .update({ last_daily_plan_on: date })
        .eq("id", 1);
    }

    return NextResponse.json({ ok: true, date, total: tasks.length, dry, text: message.text });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
