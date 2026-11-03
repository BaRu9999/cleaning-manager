/**
 * LIFF からの清掃タスク操作（本人の担当のみ）。
 * body: { action: "start" | "complete", comment?, actualMinutes? }
 * 本人判定はサーバーのトークン検証 + task.assignee_id の一致で行う
 * （URL パラメータで staff を渡す方式は使わない）。
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireLiffStaff } from "@/lib/liff/session";
import { liffErrorResponse } from "@/lib/liff/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["start", "complete"]),
  comment: z.string().trim().max(2000).optional(),
  actualMinutes: z.coerce.number().int().min(0).max(600).nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { staff, admin } = await requireLiffStaff(request);
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "パラメータが不正です" }, { status: 400 });
    }

    const { data: task } = await admin
      .from("cleaning_tasks")
      .select("id, status, was_overdue, assignee_id, master_id, master_name, task_date, photo_requirement")
      .eq("id", id)
      .maybeSingle();
    if (!task) {
      return NextResponse.json({ ok: false, error: "タスクが見つかりません" }, { status: 404 });
    }
    const t = task as Record<string, unknown>;
    if (String(t.assignee_id ?? "") !== staff.staffId) {
      return NextResponse.json({ ok: false, error: "自分の担当タスクではありません" }, { status: 403 });
    }
    if (t.status === "skipped") {
      return NextResponse.json({ ok: false, error: "スキップ済みです" }, { status: 409 });
    }

    const nowIso = new Date().toISOString();

    if (parsed.data.action === "start") {
      if (t.status === "done") {
        return NextResponse.json({ ok: false, error: "すでに完了しています" }, { status: 409 });
      }
      if (t.status !== "in_progress") {
        await admin
          .from("cleaning_tasks")
          .update({ status: "in_progress", started_at: nowIso, started_by: staff.staffId })
          .eq("id", id);
        await admin.from("cleaning_logs").insert({
          task_id: id,
          master_id: t.master_id,
          master_name: t.master_name,
          task_date: t.task_date,
          action: "start",
          status_after: "in_progress",
          actor_id: staff.staffId,
        });
      }
      return NextResponse.json({ ok: true, status: "in_progress" });
    }

    // complete
    if (t.status === "done") {
      return NextResponse.json({ ok: false, error: "すでに完了しています" }, { status: 409 });
    }
    if (t.photo_requirement === "required") {
      const { count } = await admin
        .from("cleaning_photos")
        .select("id", { count: "exact", head: true })
        .eq("task_id", id);
      if (!count || count < 1) {
        return NextResponse.json(
          { ok: false, error: "この清掃は写真が必須です。写真を追加してください。" },
          { status: 422 },
        );
      }
    }

    await admin
      .from("cleaning_tasks")
      .update({
        status: "done",
        completed_at: nowIso,
        completed_by: staff.staffId,
        comment: parsed.data.comment || null,
        actual_minutes: parsed.data.actualMinutes ?? null,
        was_overdue: t.was_overdue === true || t.status === "overdue",
      })
      .eq("id", id);
    await admin.from("cleaning_logs").insert({
      task_id: id,
      master_id: t.master_id,
      master_name: t.master_name,
      task_date: t.task_date,
      action: "complete",
      status_after: "done",
      actor_id: staff.staffId,
      comment: parsed.data.comment || null,
      actual_minutes: parsed.data.actualMinutes ?? null,
    });

    // 本人の当日タスクが全完了したか
    const { data: remaining } = await admin
      .from("cleaning_tasks")
      .select("id")
      .eq("task_date", t.task_date)
      .eq("assignee_id", staff.staffId)
      .in("status", ["pending", "in_progress", "overdue"]);
    const allDone = (remaining ?? []).length === 0;

    return NextResponse.json({ ok: true, status: "done", allDone });
  } catch (e) {
    return liffErrorResponse(e);
  }
}
