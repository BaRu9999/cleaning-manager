/**
 * 当日の清掃タスクを自動生成する Cron。
 * 実行: Vercel Cron "5 15 * * *"（= JST 00:05）。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * 手動テスト:
 *   curl -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/generate-tasks?date=2026-09-10"
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreSettingsAdmin } from "@/lib/data/settings";
import { runGeneration } from "@/lib/cleaning/run-generation";
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
    const result = await runGeneration(admin, date, store.timeSlots);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
