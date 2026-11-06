/**
 * 当日タスク生成の実行本体。Cron（service_role クライアント）と
 * 管理者の手動再生成（RLS クライアント）の両方から呼ぶ。
 * 冪等: 同じ (master, schedule, 日付) の auto タスクは二重生成しない。
 *
 * 前倒し消化: 生成対象のうち「毎日」以外の定期スケジュールで、直前の発生日より後・
 * 今回の予定日より前に同じ清掃項目（master_id）が完了済みなら、今回分は生成するが
 * 最初から完了済み（fulfilled_by_task_id 付き）として記録する（pull-forward.ts）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimeSlotConfig } from "@/config/constants";
import {
  planTasksForDate,
  plannedTaskToRow,
  type GenMaster,
} from "./generate";
import {
  applyFulfillment,
  findFulfillment,
  findPreviousOccurrence,
  isPullForwardEligible,
  type DoneTaskForFulfillment,
  type PullForwardFulfillment,
} from "./pull-forward";
import type { RecurrenceRule } from "./recurrence";

export interface GenerationResult {
  date: string;
  planned: number;
  inserted: number;
  alreadyExisted: number;
  /** 前倒し消化として最初から完了済みで生成した件数（inserted に含む） */
  pulledForward: number;
}

function embeddedName(v: unknown): string | null {
  if (!v) return null;
  const o = Array.isArray(v) ? v[0] : v;
  return o && typeof o === "object" && "name" in o
    ? ((o as { name?: string }).name ?? null)
    : null;
}

async function loadGenMasters(supabase: SupabaseClient): Promise<GenMaster[]> {
  const { data: masters, error: mErr } = await supabase
    .from("cleaning_master")
    .select(
      "id, name, active, area_id, category_id, position, default_assignee_id, " +
        "photo_requirement, priority, estimated_minutes, notes, " +
        "area:cleaning_areas!area_id(name), category:cleaning_categories!category_id(name)",
    )
    .eq("active", true);
  if (mErr) throw new Error(`マスタ取得に失敗: ${mErr.message}`);

  const rows = (masters ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));
  if (ids.length === 0) return [];

  const { data: schedules, error: sErr } = await supabase
    .from("cleaning_schedules")
    .select("*")
    .eq("active", true)
    .in("master_id", ids);
  if (sErr) throw new Error(`スケジュール取得に失敗: ${sErr.message}`);

  const byMaster = new Map<string, Record<string, unknown>[]>();
  for (const s of (schedules ?? []) as Record<string, unknown>[]) {
    const mid = String(s.master_id);
    const arr = byMaster.get(mid) ?? [];
    arr.push(s);
    byMaster.set(mid, arr);
  }

  return rows.map((r) => {
    const id = String(r.id);
    return {
      id,
      name: String(r.name),
      active: r.active !== false,
      areaId: (r.area_id as string | null) ?? null,
      areaLabel: embeddedName(r.area),
      categoryId: (r.category_id as string | null) ?? null,
      categoryLabel: embeddedName(r.category),
      position: (r.position as string | null) ?? null,
      defaultAssigneeId: (r.default_assignee_id as string | null) ?? null,
      photoRequirement: (r.photo_requirement as GenMaster["photoRequirement"]) ?? "optional",
      priority: (r.priority as GenMaster["priority"]) ?? "normal",
      estimatedMinutes: (r.estimated_minutes as number | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      schedules: (byMaster.get(id) ?? []).map((s) => ({
        id: String(s.id),
        active: s.active !== false,
        timeSlot: (s.time_slot as GenMaster["schedules"][number]["timeSlot"]) ?? "open_hours",
        fixedTime: (s.fixed_time as string | null) ?? null,
        dueTime: (s.due_time as string | null) ?? null,
        rule: {
          frequency: (s.frequency as GenMaster["schedules"][number]["rule"]["frequency"]) ?? "manual",
          weekdays: Array.isArray(s.weekdays) ? (s.weekdays as number[]) : [],
          daysOfMonth: Array.isArray(s.days_of_month) ? (s.days_of_month as number[]) : [],
          intervalDays: (s.interval_days as number | null) ?? null,
          anchorDate: (s.anchor_date as string | null) ?? null,
        },
      })),
    } satisfies GenMaster;
  });
}

/** 前倒し消化の判定対象（key: masterId|scheduleId）と、その直前の発生日を洗い出す（DB不要） */
function findPullForwardWindows(
  masters: GenMaster[],
  planned: { masterId: string; scheduleId: string }[],
  date: string,
): Map<string, string> {
  const ruleByKey = new Map<string, RecurrenceRule>();
  for (const m of masters) {
    for (const s of m.schedules) {
      ruleByKey.set(`${m.id}|${s.id}`, s.rule);
    }
  }

  const windows = new Map<string, string>();
  for (const p of planned) {
    const key = `${p.masterId}|${p.scheduleId}`;
    const rule = ruleByKey.get(key);
    if (!rule || !isPullForwardEligible(rule.frequency)) continue;
    const previousOccurrence = findPreviousOccurrence(rule, date);
    if (previousOccurrence) windows.set(key, previousOccurrence);
  }
  return windows;
}

/** 前倒し消化の判定対象について、実際に完了済みタスクが充足元として存在するか DB で確認する */
async function findFulfillments(
  supabase: SupabaseClient,
  masterIds: string[],
  windows: Map<string, string>,
  planned: { masterId: string; scheduleId: string }[],
  date: string,
): Promise<Map<string, PullForwardFulfillment>> {
  const fulfillMap = new Map<string, PullForwardFulfillment>();
  if (masterIds.length === 0) return fulfillMap;

  const minPrevious = Array.from(windows.values()).sort()[0];
  const { data: doneRows, error: doneErr } = await supabase
    .from("cleaning_tasks")
    .select("id, master_id, task_date, completed_at, completed_by")
    .eq("status", "done")
    .in("master_id", masterIds)
    .gte("task_date", minPrevious)
    .lt("task_date", date);
  if (doneErr) throw new Error(`前倒し判定用タスク取得に失敗: ${doneErr.message}`);

  const doneByMaster = new Map<string, DoneTaskForFulfillment[]>();
  for (const r of (doneRows ?? []) as Record<string, unknown>[]) {
    const mid = String(r.master_id);
    const arr = doneByMaster.get(mid) ?? [];
    arr.push({
      id: String(r.id),
      taskDate: String(r.task_date),
      completedAt: (r.completed_at as string | null) ?? null,
      completedById: (r.completed_by as string | null) ?? null,
    });
    doneByMaster.set(mid, arr);
  }

  for (const p of planned) {
    const key = `${p.masterId}|${p.scheduleId}`;
    const previousOccurrence = windows.get(key);
    if (!previousOccurrence) continue;
    const fulfillment = findFulfillment(
      doneByMaster.get(p.masterId) ?? [],
      previousOccurrence,
      date,
    );
    if (fulfillment) fulfillMap.set(key, fulfillment);
  }
  return fulfillMap;
}

export async function runGeneration(
  supabase: SupabaseClient,
  date: string,
  timeSlots: TimeSlotConfig[] | undefined,
): Promise<GenerationResult> {
  const masters = await loadGenMasters(supabase);
  const planned = planTasksForDate(masters, date, timeSlots);

  const { data: existing, error: exErr } = await supabase
    .from("cleaning_tasks")
    .select("master_id, schedule_id")
    .eq("task_date", date)
    .eq("source", "auto");
  if (exErr) throw new Error(`既存タスク取得に失敗: ${exErr.message}`);

  const seen = new Set(
    (existing ?? []).map(
      (r) => `${(r as Record<string, unknown>).master_id}|${(r as Record<string, unknown>).schedule_id}`,
    ),
  );
  const toPlan = planned.filter((p) => !seen.has(`${p.masterId}|${p.scheduleId}`));

  const pullForwardWindows = findPullForwardWindows(masters, toPlan, date);
  const pullForwardMasterIds = Array.from(
    new Set(
      toPlan
        .filter((p) => pullForwardWindows.has(`${p.masterId}|${p.scheduleId}`))
        .map((p) => p.masterId),
    ),
  );
  const fulfillMap = await findFulfillments(
    supabase,
    pullForwardMasterIds,
    pullForwardWindows,
    toPlan,
    date,
  );

  const toInsertPending: Record<string, unknown>[] = [];
  const toInsertFulfilled: { row: Record<string, unknown>; fulfillment: PullForwardFulfillment }[] = [];
  for (const p of toPlan) {
    const row = plannedTaskToRow(p);
    const fulfillment = fulfillMap.get(`${p.masterId}|${p.scheduleId}`);
    if (fulfillment) {
      toInsertFulfilled.push({ row: applyFulfillment(row, fulfillment), fulfillment });
    } else {
      toInsertPending.push(row);
    }
  }

  let inserted = 0;
  if (toInsertPending.length > 0) {
    const { error: insErr, count } = await supabase
      .from("cleaning_tasks")
      .insert(toInsertPending, { count: "exact" });
    if (insErr) throw new Error(`タスク生成に失敗: ${insErr.message}`);
    inserted = count ?? toInsertPending.length;
  }

  let pulledForward = 0;
  for (const { row } of toInsertFulfilled) {
    const { data: created, error: insErr } = await supabase
      .from("cleaning_tasks")
      .insert(row)
      .select("id")
      .single();
    if (insErr || !created) {
      throw new Error(`前倒し消化タスクの作成に失敗: ${insErr?.message ?? ""}`);
    }
    const newTaskId = String((created as { id: string }).id);
    await supabase.from("cleaning_logs").insert({
      task_id: newTaskId,
      master_id: row.master_id,
      master_name: row.master_name,
      task_date: row.task_date,
      action: "fulfilled_early",
      status_after: "done",
      actor_id: null,
      comment: row.comment,
    });
    pulledForward += 1;
  }

  return {
    date,
    planned: planned.length,
    inserted: inserted + pulledForward,
    alreadyExisted: planned.length - toPlan.length,
    pulledForward,
  };
}
