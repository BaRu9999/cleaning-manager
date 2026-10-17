/**
 * 朝の清掃予定通知（LINE・役職別）。
 * 実行: Vercel Cron "0,30 * * * *"。`line_morning_time` ±15分に配信。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * 一般スタッフ … 自分の担当のみ（Flex）
 * 清掃リーダー / ホールリーダー / 店長 … 全体スケジュール（誰が・何時までに・どこを・状態）
 *   ＋ 清掃リーダー・店長は 未実施/期限超過/担当未設定 の管理サマリ
 * 受信可否は notification_settings.line_role_prefs[役職].morning。
 *
 * クエリ: dry=1 / force=1（時刻・日次ガード無視） / date=YYYY-MM-DD / at=HH:MM
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getNotificationSettingsAdmin,
  getStoreSettingsAdmin,
} from "@/lib/data/settings";
import { jstTimeString } from "@/lib/date/jst";
import { runGeneration } from "@/lib/cleaning/run-generation";
import { dispatchMorning } from "@/lib/line/dispatch";
import {
  authorizeCron,
  cronParams,
  loadDateTasksAdmin,
  unauthorized,
} from "@/lib/cron/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return (h ?? 0) * 60 + (m ?? 0);
};

async function handle(request: Request): Promise<Response> {
  if (!authorizeCron(request)) return unauthorized();
  const { date, dry, force } = cronParams(request);
  const nowHHMM = new URL(request.url).searchParams.get("at") ?? jstTimeString();

  try {
    const admin = createAdminClient();
    const settings = await getNotificationSettingsAdmin();
    const store = await getStoreSettingsAdmin();

    if (!settings.lineEnabled) return NextResponse.json({ ok: true, skipped: "line_disabled" });
    if (!force && Math.abs(toMin(nowHHMM) - toMin(settings.lineMorningTime)) > 15) {
      return NextResponse.json({ ok: true, skipped: "not_scheduled", now: nowHHMM, target: settings.lineMorningTime });
    }
    if (!force && !dry && settings.lastLineMorningOn === date) {
      return NextResponse.json({ ok: true, skipped: "already_sent", date });
    }

    await runGeneration(admin, date, store.timeSlots).catch(() => undefined);
    const tasks = await loadDateTasksAdmin(admin, date);
    const result = await dispatchMorning({ admin, settings, store, tasks, date, dry });

    if (!dry) {
      await admin.from("notification_settings").update({ last_line_morning_on: date }).eq("id", 1);
    }
    return NextResponse.json({ ok: true, date, at: nowHHMM, dry, line: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
