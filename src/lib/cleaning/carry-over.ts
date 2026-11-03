/**
 * 実施不可 → 翌日繰越の純ロジック。
 *
 * 「同じ清掃が翌日に通常スケジュールで既に存在する場合は重複させない」を、
 * 翌日のタスクをまだ生成していない時点（実施不可registered時）でも判定できるよう、
 * DB を見ずにスケジュールの発火判定（shouldRunOn）だけで事前に決める。
 */

import type { PhotoRequirement, Priority, TimeSlotKey } from "@/config/constants";
import { formatTimeJst, jstDateTimeToInstant, trimSeconds } from "@/lib/date/jst";
import { shouldRunOn, type RecurrenceRule } from "./recurrence";

export interface ScheduleForRecurrenceCheck {
  active: boolean;
  rule: RecurrenceRule;
}

/** 翌日、通常のスケジュールで同じマスタのタスクが自然に生成されるか */
export function willRecurNaturally(
  schedules: ScheduleForRecurrenceCheck[],
  nextDate: string,
): boolean {
  return schedules.some((s) => s.active && shouldRunOn(s.rule, nextDate));
}

export interface CarryOverSourceTask {
  id: string;
  masterId: string | null;
  masterName: string;
  areaId: string | null;
  areaLabel: string | null;
  categoryId: string | null;
  categoryLabel: string | null;
  timeSlot: TimeSlotKey;
  fixedTime: string | null;
  dueAt: string | null;
  position: string | null;
  assigneeId: string | null;
  photoRequirement: PhotoRequirement;
  priority: Priority;
  estimatedMinutes: number | null;
  notes: string | null;
}

/** 繰越タスクの DB 行（snake_case, source='manual', status='pending'） */
export function buildCarryOverRow(
  source: CarryOverSourceTask,
  nextDate: string,
): Record<string, unknown> {
  const clockTime = source.fixedTime ? trimSeconds(source.fixedTime) : formatTimeJst(source.dueAt);
  const dueAt = clockTime ? jstDateTimeToInstant(nextDate, clockTime).toISOString() : null;

  return {
    master_id: source.masterId,
    schedule_id: null,
    task_date: nextDate,
    master_name: source.masterName,
    area_id: source.areaId,
    area_label: source.areaLabel,
    category_id: source.categoryId,
    category_label: source.categoryLabel,
    time_slot: source.timeSlot,
    fixed_time: source.fixedTime,
    due_at: dueAt,
    position: source.position,
    assignee_id: source.assigneeId,
    photo_requirement: source.photoRequirement,
    priority: source.priority,
    estimated_minutes: source.estimatedMinutes,
    notes: source.notes,
    status: "pending",
    source: "manual",
    origin_task_id: source.id,
  };
}
