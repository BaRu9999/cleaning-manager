/**
 * 当日タスクの「生成計画」を作る純関数。
 * 実際の DB 書き込みは Cron ルート（`/api/cron/generate-tasks`）が行う。
 * ここは「マスタ + スケジュール + 対象日」から生成すべきタスク行を返すだけ。
 */

import type {
  PhotoRequirement,
  Priority,
  TimeSlotConfig,
  TimeSlotKey,
} from "@/config/constants";
import { jstDateTimeToInstant } from "@/lib/date/jst";
import { shouldRunOn, type RecurrenceRule } from "./recurrence";
import { resolveDueTime } from "./slots";

export interface GenSchedule {
  id: string;
  active: boolean;
  rule: RecurrenceRule;
  timeSlot: TimeSlotKey;
  fixedTime: string | null;
  dueTime: string | null;
}

export interface GenMaster {
  id: string;
  name: string;
  active: boolean;
  areaId: string | null;
  areaLabel: string | null;
  categoryId: string | null;
  categoryLabel: string | null;
  position: string | null;
  defaultAssigneeId: string | null;
  photoRequirement: PhotoRequirement;
  priority: Priority;
  estimatedMinutes: number | null;
  notes: string | null;
  schedules: GenSchedule[];
}

export interface PlannedTask {
  masterId: string;
  scheduleId: string;
  taskDate: string;
  masterName: string;
  areaId: string | null;
  areaLabel: string | null;
  categoryId: string | null;
  categoryLabel: string | null;
  timeSlot: TimeSlotKey;
  fixedTime: string | null;
  /** ISO 文字列（timestamptz）。期限が無ければ null */
  dueAt: string | null;
  position: string | null;
  assigneeId: string | null;
  photoRequirement: PhotoRequirement;
  priority: Priority;
  estimatedMinutes: number | null;
  notes: string | null;
}

/** 指定日に生成すべきタスク一覧（純関数） */
export function planTasksForDate(
  masters: GenMaster[],
  date: string,
  storeTimeSlots: TimeSlotConfig[] | undefined,
): PlannedTask[] {
  const out: PlannedTask[] = [];

  for (const m of masters) {
    if (!m.active) continue;
    for (const s of m.schedules) {
      if (!s.active) continue;
      if (s.rule.frequency === "manual") continue;
      if (!shouldRunOn(s.rule, date)) continue;

      const dueTime = resolveDueTime(
        { dueTime: s.dueTime, timeSlot: s.timeSlot },
        storeTimeSlots,
      );
      const dueAt = dueTime
        ? jstDateTimeToInstant(date, dueTime).toISOString()
        : null;

      out.push({
        masterId: m.id,
        scheduleId: s.id,
        taskDate: date,
        masterName: m.name,
        areaId: m.areaId,
        areaLabel: m.areaLabel,
        categoryId: m.categoryId,
        categoryLabel: m.categoryLabel,
        timeSlot: s.timeSlot,
        fixedTime: s.timeSlot === "fixed_time" ? s.fixedTime : null,
        dueAt,
        position: m.position,
        assigneeId: m.defaultAssigneeId,
        photoRequirement: m.photoRequirement,
        priority: m.priority,
        estimatedMinutes: m.estimatedMinutes,
        notes: m.notes,
      });
    }
  }

  return out;
}

/** 生成計画を DB 行（snake_case, source='auto', status='pending'）へ変換 */
export function plannedTaskToRow(p: PlannedTask): Record<string, unknown> {
  return {
    master_id: p.masterId,
    schedule_id: p.scheduleId,
    task_date: p.taskDate,
    master_name: p.masterName,
    area_id: p.areaId,
    area_label: p.areaLabel,
    category_id: p.categoryId,
    category_label: p.categoryLabel,
    time_slot: p.timeSlot,
    fixed_time: p.fixedTime,
    due_at: p.dueAt,
    position: p.position,
    assignee_id: p.assigneeId,
    photo_requirement: p.photoRequirement,
    priority: p.priority,
    estimated_minutes: p.estimatedMinutes,
    notes: p.notes,
    status: "pending",
    source: "auto",
  };
}
