/** LIFF「今日の清掃」: 本人（認証で判定した staff_id）の当日タスクのみ返す。 */
import { NextResponse } from "next/server";
import { requireLiffStaff } from "@/lib/liff/session";
import { liffErrorResponse } from "@/lib/liff/respond";
import { getStoreSettingsAdmin } from "@/lib/data/settings";
import { jstDateString, formatTimeJst, trimSeconds } from "@/lib/date/jst";
import { slotLabel, slotOrder } from "@/lib/cleaning/slots";
import { summarizeProgress } from "@/lib/cleaning/progress";
import { mapTask } from "@/lib/data/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT =
  "*, cleaning_photos(count), " +
  "completed_by_user:users!completed_by(display_name)";

export async function POST(request: Request): Promise<Response> {
  try {
    const date = jstDateString();
    // トークン検証（LINE Platform への往復）と店舗設定取得は独立しているため並列化
    const [{ staff, admin }, store] = await Promise.all([
      requireLiffStaff(request),
      getStoreSettingsAdmin(),
    ]);

    const { data, error } = await admin
      .from("cleaning_tasks")
      .select(SELECT)
      .eq("task_date", date)
      .eq("assignee_id", staff.staffId);
    if (error) throw new Error(error.message);

    const tasks = ((data ?? []) as unknown as Record<string, unknown>[])
      .map(mapTask)
      .sort((a, b) => slotOrder(a.timeSlot) - slotOrder(b.timeSlot));

    const summary = summarizeProgress(tasks);

    return NextResponse.json({
      ok: true,
      date,
      staff: { displayName: staff.displayName },
      progress: { done: summary.done, total: summary.planned, rate: summary.rate },
      tasks: tasks.map((t) => ({
        id: t.id,
        name: t.masterName,
        area: t.areaLabel || t.categoryLabel || null,
        slotLabel: slotLabel(t.timeSlot, store.timeSlots),
        dueLabel: t.fixedTime ? trimSeconds(t.fixedTime) : formatTimeJst(t.dueAt),
        estimatedMinutes: t.estimatedMinutes,
        priority: t.priority,
        photoRequirement: t.photoRequirement,
        photoCount: t.photoCount,
        status: t.status,
        comment: t.comment,
      })),
    });
  } catch (e) {
    return liffErrorResponse(e);
  }
}
