import { createClient } from "@/lib/supabase/server";
import type { TimingRecord } from "@/lib/cleaning/time-analysis";

/** 期間内に完了した清掃タスクの予想/実績時間（分析用の軽量行） */
export async function getTimingRecords(from: string, to: string): Promise<TimingRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_tasks")
    .select(
      "master_id, master_name, assignee_id, estimated_minutes, actual_minutes, " +
        "assignee:users!assignee_id(display_name)",
    )
    .eq("status", "done")
    .not("actual_minutes", "is", null)
    .gte("task_date", from)
    .lte("task_date", to)
    .limit(20000);
  if (error) throw new Error(`実績時間の取得に失敗しました: ${error.message}`);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const a = r.assignee as { display_name?: string } | { display_name?: string }[] | null;
    const assignee = Array.isArray(a) ? a[0] : a;
    return {
      masterId: (r.master_id as string | null) ?? null,
      masterName: String(r.master_name ?? ""),
      assigneeId: (r.assignee_id as string | null) ?? null,
      assigneeName: assignee?.display_name ?? null,
      estimatedMinutes: (r.estimated_minutes as number | null) ?? null,
      actualMinutes: Number(r.actual_minutes ?? 0),
    };
  });
}
