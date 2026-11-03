/**
 * 「実施不可 → 繰越」の実行本体（1件）と、前日 pending/overdue のまま残ったタスクを
 * まとめて当日へ自動で繰り越す処理。
 * 手動スキップ時（task-actions.ts の skipTaskAction）と日次生成 Cron
 * （generate-tasks、service_role）の両方から呼ぶ。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoRequirement, Priority, TimeSlotKey } from "@/config/constants";
import { addDays } from "@/lib/date/jst";
import { buildCarryOverRow, willRecurNaturally, type CarryOverSourceTask } from "./carry-over";

type CarryOverRule = Parameters<typeof willRecurNaturally>[0][number]["rule"];

async function recursNaturally(
  supabase: SupabaseClient,
  masterId: string | null,
  nextDate: string,
): Promise<boolean> {
  if (!masterId) return false;
  const { data: schedules } = await supabase
    .from("cleaning_schedules")
    .select("active, frequency, weekdays, days_of_month, interval_days, anchor_date")
    .eq("master_id", masterId);
  return willRecurNaturally(
    ((schedules ?? []) as Record<string, unknown>[]).map((s) => ({
      active: s.active !== false,
      rule: {
        frequency: s.frequency as CarryOverRule["frequency"],
        weekdays: Array.isArray(s.weekdays) ? (s.weekdays as number[]) : [],
        daysOfMonth: Array.isArray(s.days_of_month) ? (s.days_of_month as number[]) : [],
        intervalDays: (s.interval_days as number | null) ?? null,
        anchorDate: (s.anchor_date as string | null) ?? null,
      },
    })),
    nextDate,
  );
}

export interface CarryOverOneResult {
  carried: boolean;
  /** 翌日も通常スケジュールで発生するため繰越を作らなかった場合 true */
  skippedNaturalRecur: boolean;
  newTaskId?: string;
}

/** 1件を nextDate へ繰り越す（翌日も通常スケジュールで自然発生するなら作らない） */
export async function carryOverOneTask(
  supabase: SupabaseClient,
  source: CarryOverSourceTask,
  nextDate: string,
  log: { actorId: string | null; comment: string },
): Promise<CarryOverOneResult> {
  if (await recursNaturally(supabase, source.masterId, nextDate)) {
    return { carried: false, skippedNaturalRecur: true };
  }
  const row = buildCarryOverRow(source, nextDate);
  const { data: created, error } = await supabase
    .from("cleaning_tasks")
    .insert(row)
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`繰越タスクの作成に失敗しました: ${error?.message ?? ""}`);
  }
  const newTaskId = String((created as { id: string }).id);
  await supabase.from("cleaning_logs").insert({
    task_id: newTaskId,
    master_id: source.masterId,
    master_name: source.masterName,
    task_date: nextDate,
    action: "carry_over",
    status_after: "pending",
    actor_id: log.actorId,
    comment: log.comment,
  });
  return { carried: true, skippedNaturalRecur: false, newTaskId };
}

export interface AutoCarryOverResult {
  date: string;
  /** 前日 pending/overdue のまま残っていた件数 */
  candidates: number;
  carried: number;
  /** 当日の通常スケジュールで自然発生するため繰越不要だった件数 */
  skippedNaturalRecur: number;
  /** 既に繰越済み（Cronの再実行等）だった件数 */
  alreadyCarried: number;
}

const CANDIDATE_SELECT =
  "id, master_id, master_name, area_id, area_label, category_id, category_label, " +
  "time_slot, fixed_time, due_at, position, assignee_id, photo_requirement, priority, " +
  "estimated_minutes, notes";

/**
 * date の前日時点で pending/overdue のまま残っているタスクを date へ自動で繰り越す。
 * 実施不可（status='skipped'）として記録済みのものは対象外（スタッフ・管理者の判断を尊重し、
 * 既存の「スキップ時に繰越するか選ぶ」フローと競合しない）。
 * 同じ元タスクから二重に繰越を作らないよう、事前チェック（アプリ側）と
 * cleaning_tasks.origin_task_id の UNIQUE INDEX（DB側、migration 0009）の二重で防ぐ。
 */
export async function runAutoCarryOver(
  supabase: SupabaseClient,
  date: string,
): Promise<AutoCarryOverResult> {
  const prevDate = addDays(date, -1);

  const { data: rows, error } = await supabase
    .from("cleaning_tasks")
    .select(CANDIDATE_SELECT)
    .eq("task_date", prevDate)
    .in("status", ["pending", "overdue"]);
  if (error) throw new Error(`前日タスクの取得に失敗しました: ${error.message}`);

  const candidates = (rows ?? []) as unknown as Record<string, unknown>[];
  if (candidates.length === 0) {
    return { date, candidates: 0, carried: 0, skippedNaturalRecur: 0, alreadyCarried: 0 };
  }

  const ids = candidates.map((r) => String(r.id));
  const { data: existing } = await supabase
    .from("cleaning_tasks")
    .select("origin_task_id")
    .eq("task_date", date)
    .in("origin_task_id", ids);
  const alreadyCarriedIds = new Set(
    ((existing ?? []) as { origin_task_id: string | null }[])
      .map((r) => r.origin_task_id)
      .filter((v): v is string => !!v),
  );

  let carried = 0;
  let skippedNaturalRecur = 0;
  let alreadyCarried = 0;

  for (const r of candidates) {
    const id = String(r.id);
    if (alreadyCarriedIds.has(id)) {
      alreadyCarried += 1;
      continue;
    }
    const source: CarryOverSourceTask = {
      id,
      masterId: (r.master_id as string | null) ?? null,
      masterName: String(r.master_name ?? ""),
      areaId: (r.area_id as string | null) ?? null,
      areaLabel: (r.area_label as string | null) ?? null,
      categoryId: (r.category_id as string | null) ?? null,
      categoryLabel: (r.category_label as string | null) ?? null,
      timeSlot: r.time_slot as TimeSlotKey,
      fixedTime: (r.fixed_time as string | null) ?? null,
      dueAt: (r.due_at as string | null) ?? null,
      position: (r.position as string | null) ?? null,
      assigneeId: (r.assignee_id as string | null) ?? null,
      photoRequirement: (r.photo_requirement as PhotoRequirement) ?? "optional",
      priority: (r.priority as Priority) ?? "normal",
      estimatedMinutes: (r.estimated_minutes as number | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    };
    const result = await carryOverOneTask(supabase, source, date, {
      actorId: null,
      comment: `前日（${prevDate}）に未実施のため自動繰越`,
    });
    if (result.carried) carried += 1;
    else if (result.skippedNaturalRecur) skippedNaturalRecur += 1;
  }

  return { date, candidates: candidates.length, carried, skippedNaturalRecur, alreadyCarried };
}
