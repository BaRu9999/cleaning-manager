/**
 * 当日タスク生成の実行本体。Cron（service_role クライアント）と
 * 管理者の手動再生成（RLS クライアント）の両方から呼ぶ。
 * 冪等: 同じ (master, schedule, 日付) の auto タスクは二重生成しない。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimeSlotConfig } from "@/config/constants";
import {
  planTasksForDate,
  plannedTaskToRow,
  type GenMaster,
} from "./generate";

export interface GenerationResult {
  date: string;
  planned: number;
  inserted: number;
  alreadyExisted: number;
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

  const toInsert = planned
    .filter((p) => !seen.has(`${p.masterId}|${p.scheduleId}`))
    .map(plannedTaskToRow);

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error: insErr, count } = await supabase
      .from("cleaning_tasks")
      .insert(toInsert, { count: "exact" });
    if (insErr) throw new Error(`タスク生成に失敗: ${insErr.message}`);
    inserted = count ?? toInsert.length;
  }

  return {
    date,
    planned: planned.length,
    inserted,
    alreadyExisted: planned.length - toInsert.length,
  };
}
