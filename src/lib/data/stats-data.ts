import { createClient } from "@/lib/supabase/server";
import { dayOfWeek } from "@/lib/date/jst";
import type { StatTask } from "@/lib/cleaning/stats";

const STAT_SELECT =
  "task_date, status, master_id, master_name, area_label, category_label, " +
  "completed_by, completed_by_user:users!completed_by(display_name)";

function embeddedName(v: unknown): string | null {
  if (!v) return null;
  const o = Array.isArray(v) ? v[0] : v;
  return o && typeof o === "object" && "display_name" in o
    ? ((o as { display_name?: string }).display_name ?? null)
    : null;
}

/** 指定期間（両端含む）の集計用タスク配列 */
export async function getStatTasks(
  from: string,
  to: string,
): Promise<StatTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_tasks")
    .select(STAT_SELECT)
    .gte("task_date", from)
    .lte("task_date", to)
    .limit(20000);
  if (error) throw new Error(`集計データの取得に失敗しました: ${error.message}`);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    taskDate: String(r.task_date),
    status: r.status as StatTask["status"],
    masterId: (r.master_id as string | null) ?? null,
    masterName: String(r.master_name ?? ""),
    areaLabel: (r.area_label as string | null) ?? null,
    categoryLabel: (r.category_label as string | null) ?? null,
    completedById: (r.completed_by as string | null) ?? null,
    completedByName: embeddedName(r.completed_by_user),
  }));
}

/** 月曜始まりの週の開始日 */
export function startOfWeekMon(dateStr: string): string {
  const offset = (dayOfWeek(dateStr) + 6) % 7;
  const [y, m, d] = dateStr.split("-").map((n) => Number.parseInt(n, 10));
  const base = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - offset);
  return new Date(base).toISOString().slice(0, 10);
}
