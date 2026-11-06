/**
 * 当日の清掃タスクを自動生成し、前日 pending/overdue のまま残ったタスクを自動繰越したうえで、
 * その日の daily_staffing（シフト取込・手動登録どちらでも可）が既にあれば続けて
 * 自動割当まで行う Cron。
 * 実行: Vercel Cron "5 15 * * *"（= JST 00:05）。
 * 認証: Authorization: Bearer ${CRON_SECRET}
 *
 * 出勤スタッフが未登録の日は割当をスキップするだけで、タスク生成・自動繰越自体は
 * 失敗させない（シフト未取込の店舗・日でも今まで通り動く。その場合は /admin/assignments
 * で手動割当）。自動繰越は「実施不可として記録済み（status='skipped'）」のタスクは対象外
 * （スタッフ・管理者の判断を尊重。繰越したい場合は実施不可の「翌日に繰り越す」を使う）。
 *
 * タスク生成（runGeneration）自体にも「前倒し消化」を内包する。毎日以外の定期スケジュールで、
 * 直前の発生日より後・今回の予定日より前に同じ清掃項目が完了済みなら、今回分は生成するが
 * 最初から完了済み（pull-forward.ts, fulfilled_by_task_id）として記録し、二重実施を求めない。
 *
 * 手動テスト:
 *   curl -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/generate-tasks?date=2026-09-10"
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreSettingsAdmin } from "@/lib/data/settings";
import { runGeneration } from "@/lib/cleaning/run-generation";
import { runAutoCarryOver } from "@/lib/cleaning/run-carry-over";
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
    const carryOver = await runAutoCarryOver(admin, date);
    const assignment = await runAutoAssign(admin, date);
    return NextResponse.json({ ok: true, generation, carryOver, assignment });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
