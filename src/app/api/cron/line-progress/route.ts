/**
 * 途中進捗の LINE 通知（管理者・清掃リーダー向け）。
 * 実行: Vercel Cron "0,30 * * * *"。`line_progress_times` のいずれかに一致したときだけ配信。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * 内容:「HH:MM現在 / 予定・完了・未実施・完了率 ＋ ■未実施（担当・期限）」
 * 対象スコープは役職の閲覧範囲（清掃リーダー=全部、ホールリーダー=ホール系、店長=全部）。
 * 受信可否は line_role_prefs[役職].progress。
 *
 * クエリ: dry=1 / force=1（時刻・間隔ガード無視） / date=YYYY-MM-DD / at=HH:MM
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getNotificationSettingsAdmin,
  getStoreSettingsAdmin,
} from "@/lib/data/settings";
import { jstTimeString } from "@/lib/date/jst";
import { dispatchProgress } from "@/lib/line/dispatch";
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
  const nowMin = toMin(nowHHMM);

  try {
    const admin = createAdminClient();
    const settings = await getNotificationSettingsAdmin();
    const store = await getStoreSettingsAdmin();

    if (!settings.lineEnabled) return NextResponse.json({ ok: true, skipped: "line_disabled" });

    const matched = force
      ? nowHHMM
      : settings.lineProgressTimes.find((t) => Math.abs(toMin(t) - nowMin) <= 15);
    if (!matched) {
      return NextResponse.json({ ok: true, skipped: "not_scheduled", now: nowHHMM });
    }
    if (!force && settings.lastLineProgressAt) {
      const ageMs = Date.now() - Date.parse(settings.lastLineProgressAt);
      if (Number.isFinite(ageMs) && ageMs < 25 * 60 * 1000) {
        return NextResponse.json({ ok: true, skipped: "recently_sent" });
      }
    }

    const tasks = (await loadDateTasksAdmin(admin, date)).filter((t) => t.status !== "skipped");
    const result = await dispatchProgress({
      admin,
      settings,
      store,
      tasks,
      date,
      nowLabel: matched,
      dry,
    });

    if (!dry) {
      await admin
        .from("notification_settings")
        .update({ last_line_progress_at: new Date().toISOString() })
        .eq("id", 1);
    }
    return NextResponse.json({ ok: true, at: matched, dry, line: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
