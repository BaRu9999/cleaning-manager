/**
 * 当日の清掃タスクを自動生成し、その日の daily_staffing（シフト取込・手動登録どちらでも可）が
 * 既にあれば続けて自動割当まで行う Cron。
 * 実行: Vercel Cron "5 15 * * *"（= JST 00:05）。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * 出勤スタッフが未登録の日は割当をスキップするだけで、タスク生成自体は失敗させない
 * （シフト未取込の店舗・日でも今まで通り動く。その場合は /admin/assignments で手動割当）。
 *
 * 手動テスト:
 *   curl -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/generate-tasks?date=2026-09-10"
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreSettingsAdmin } from "@/lib/data/settings";
import { runGeneration } from "@/lib/cleaning/run-generation";
import { runAutoAssign } from "@/lib/cleaning/run-auto-assign";
import { authorizeCron, cronParams, unauthorized } from "@/lib/cron/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  if (!authorizeCron(request)) return unauthorized();
  const { date } = cronParams(request);

  try {
    const admin = createAdminClient();
    const store = await getStoreSettingsAdmin();
    const generation = await runGeneration(admin, date, store.timeSlots);
    const assignment = await runAutoAssign(admin, date);
    return NextResponse.json({ ok: true, generation, assignment });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
