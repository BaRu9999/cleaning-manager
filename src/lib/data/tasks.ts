import { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET } from "@/config/constants";
import { jstDateString } from "@/lib/date/jst";
import { slotOrder } from "@/lib/cleaning/slots";
import { mapLog, mapPhoto, mapTask } from "./mappers";
import type {
  CleaningLog,
  CleaningPhoto,
  CleaningTask,
} from "@/lib/types/domain";
import type { TaskStatus } from "@/config/constants";

const TASK_SELECT =
  "*, assignee:users!assignee_id(display_name), " +
  "completed_by_user:users!completed_by(display_name), " +
  "started_by_user:users!started_by(display_name), " +
  "cleaning_photos(count)";

const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

function sortTasks(tasks: CleaningTask[]): CleaningTask[] {
  return [...tasks].sort(
    (a, b) =>
      slotOrder(a.timeSlot) - slotOrder(b.timeSlot) ||
      (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
      a.masterName.localeCompare(b.masterName, "ja"),
  );
}

export async function getTasksForDate(
  date: string,
  opts: { assigneeId?: string } = {},
): Promise<CleaningTask[]> {
  const supabase = await createClient();
  let q = supabase.from("cleaning_tasks").select(TASK_SELECT).eq("task_date", date);
  if (opts.assigneeId) q = q.eq("assignee_id", opts.assigneeId);
  const { data, error } = await q;
  if (error) throw new Error(`清掃タスクの取得に失敗しました: ${error.message}`);
  return sortTasks(
    ((data ?? []) as unknown as Record<string, unknown>[]).map(mapTask),
  );
}

export async function getTodayTasks(
  opts: { assigneeId?: string } = {},
): Promise<{ date: string; tasks: CleaningTask[] }> {
  const date = jstDateString();
  return { date, tasks: await getTasksForDate(date, opts) };
}

export async function getTask(id: string): Promise<CleaningTask | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`清掃タスクの取得に失敗しました: ${error.message}`);
  return data ? mapTask(data as unknown as Record<string, unknown>) : null;
}

export async function getTaskPhotos(taskId: string): Promise<CleaningPhoto[]> {
  const byTask = await getPhotosForTasks([taskId]);
  return byTask.get(taskId) ?? [];
}

/**
 * 複数タスク分の写真を一括取得し、タスクIDごとにまとめて返す（日別レポートの
 * サムネイル表示用）。署名付きURLの発行は対象タスク全体で1回にまとめる。
 */
export async function getPhotosForTasks(
  taskIds: string[],
): Promise<Map<string, CleaningPhoto[]>> {
  const byTask = new Map<string, CleaningPhoto[]>();
  if (taskIds.length === 0) return byTask;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_photos")
    .select("*")
    .in("task_id", taskIds)
    .order("created_at");
  if (error) throw new Error(`写真の取得に失敗しました: ${error.message}`);
  const photos = (data ?? []).map((r) => mapPhoto(r as Record<string, unknown>));
  if (photos.length === 0) return byTask;

  const { data: signed } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(
      photos.map((p) => p.storagePath),
      60 * 60,
    );
  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? null]),
  );
  for (const p of photos) {
    const withUrl: CleaningPhoto = { ...p, signedUrl: urlByPath.get(p.storagePath) ?? null };
    const arr = byTask.get(p.taskId) ?? [];
    arr.push(withUrl);
    byTask.set(p.taskId, arr);
  }
  return byTask;
}

export async function getTaskLogs(taskId: string): Promise<CleaningLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cleaning_logs")
    .select("*, actor:users!actor_id(display_name)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`履歴の取得に失敗しました: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapLog);
}

export interface HistoryFilters {
  from?: string;
  to?: string;
  completedById?: string;
  areaId?: string;
  categoryId?: string;
  masterId?: string;
  /** "done" | "not_done" | 個別 status */
  status?: "done" | "not_done" | TaskStatus;
  q?: string;
  limit?: number;
}

export async function getHistory(
  filters: HistoryFilters = {},
): Promise<CleaningTask[]> {
  const supabase = await createClient();
  let q = supabase.from("cleaning_tasks").select(TASK_SELECT);

  if (filters.from) q = q.gte("task_date", filters.from);
  if (filters.to) q = q.lte("task_date", filters.to);
  if (filters.completedById) q = q.eq("completed_by", filters.completedById);
  if (filters.areaId) q = q.eq("area_id", filters.areaId);
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
  if (filters.masterId) q = q.eq("master_id", filters.masterId);
  if (filters.q) q = q.ilike("master_name", `%${filters.q}%`);
  if (filters.status === "done") q = q.eq("status", "done");
  else if (filters.status === "not_done")
    q = q.in("status", ["pending", "overdue", "skipped"]);
  else if (filters.status) q = q.eq("status", filters.status);

  const { data, error } = await q
    .order("task_date", { ascending: false })
    .limit(filters.limit ?? 400);
  if (error) throw new Error(`履歴の取得に失敗しました: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapTask);
}
