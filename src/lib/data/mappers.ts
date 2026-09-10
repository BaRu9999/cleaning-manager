/**
 * DB 行（snake_case / PostgREST の JSON）→ ドメイン型（camelCase）の変換を集約。
 * 埋め込み（`select("*, area:cleaning_areas(name)")`）の揺れも吸収する。
 */

import type {
  Frequency,
  PhotoRequirement,
  Priority,
  Role,
  TaskStatus,
  TimeSlotKey,
} from "@/config/constants";
import {
  DEFAULT_POSITIONS,
  DEFAULT_TIME_SLOTS,
  FREQUENCIES,
  PHOTO_REQUIREMENTS,
  PRIORITIES,
  ROLES,
  TASK_STATUSES,
  TIME_SLOTS,
} from "@/config/constants";
import type {
  CleaningArea,
  CleaningCategory,
  CleaningLog,
  CleaningMaster,
  CleaningPhoto,
  CleaningSchedule,
  CleaningTask,
  LogAction,
  NotificationSettings,
  StoreSettings,
  TimeSlotConfig,
  UserProfile,
} from "@/lib/types/domain";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : v == null ? null : Number(v) || null;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function intArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}
function oneOf<T extends readonly string[]>(
  v: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T[number])
    : fallback;
}

/** 埋め込み `foo:table(name)` は配列 or オブジェクト or null で返りうる */
function embeddedName(v: unknown): string | null {
  if (!v) return null;
  const obj = Array.isArray(v) ? v[0] : v;
  if (obj && typeof obj === "object" && "name" in obj) {
    return strOrNull((obj as Row).name);
  }
  return null;
}
function embeddedField(v: unknown, field: string): string | null {
  if (!v) return null;
  const obj = Array.isArray(v) ? v[0] : v;
  if (obj && typeof obj === "object" && field in obj) {
    return strOrNull((obj as Row)[field]);
  }
  return null;
}

// ---------------------------------------------------------------------------
export function mapUserProfile(row: Row): UserProfile {
  return {
    id: str(row.id),
    email: strOrNull(row.email),
    displayName: str(row.display_name) || "(名称未設定)",
    role: oneOf<typeof ROLES>(row.role, ROLES, "staff") as Role,
    position: strOrNull(row.position),
    phone: strOrNull(row.phone),
    active: bool(row.active),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapCategory(row: Row): CleaningCategory {
  return {
    id: str(row.id),
    name: str(row.name),
    sortOrder: numOrNull(row.sort_order) ?? 0,
    active: bool(row.active, true),
  };
}

export function mapArea(row: Row): CleaningArea {
  return {
    id: str(row.id),
    categoryId: str(row.category_id),
    categoryName: embeddedName(row.category) ?? undefined,
    name: str(row.name),
    sortOrder: numOrNull(row.sort_order) ?? 0,
    active: bool(row.active, true),
  };
}

export function mapSchedule(row: Row): CleaningSchedule {
  return {
    id: str(row.id),
    masterId: str(row.master_id),
    frequency: oneOf<typeof FREQUENCIES>(row.frequency, FREQUENCIES, "manual") as Frequency,
    weekdays: intArray(row.weekdays),
    daysOfMonth: intArray(row.days_of_month),
    intervalDays: numOrNull(row.interval_days),
    anchorDate: strOrNull(row.anchor_date),
    timeSlot: oneOf<typeof TIME_SLOTS>(row.time_slot, TIME_SLOTS, "open_hours") as TimeSlotKey,
    fixedTime: strOrNull(row.fixed_time),
    dueTime: strOrNull(row.due_time),
    active: bool(row.active, true),
  };
}

export function mapMaster(row: Row): CleaningMaster {
  const schedulesRaw = Array.isArray(row.schedules)
    ? (row.schedules as Row[])
    : Array.isArray(row.cleaning_schedules)
      ? (row.cleaning_schedules as Row[])
      : [];
  return {
    id: str(row.id),
    name: str(row.name),
    areaId: strOrNull(row.area_id),
    areaName: embeddedName(row.area),
    categoryId: strOrNull(row.category_id),
    categoryName: embeddedName(row.category),
    description: strOrNull(row.description),
    method: strOrNull(row.method),
    supplies: strOrNull(row.supplies),
    estimatedMinutes: numOrNull(row.estimated_minutes),
    position: strOrNull(row.position),
    defaultAssigneeId: strOrNull(row.default_assignee_id),
    defaultAssigneeName: embeddedField(row.assignee, "display_name"),
    photoRequirement: oneOf<typeof PHOTO_REQUIREMENTS>(
      row.photo_requirement,
      PHOTO_REQUIREMENTS,
      "optional",
    ) as PhotoRequirement,
    priority: oneOf<typeof PRIORITIES>(row.priority, PRIORITIES, "normal") as Priority,
    notes: strOrNull(row.notes),
    active: bool(row.active, true),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    schedules: schedulesRaw.map(mapSchedule),
  };
}

export function mapTask(row: Row): CleaningTask {
  const photos = row.cleaning_photos;
  const photoCount =
    typeof row.photo_count === "number"
      ? row.photo_count
      : Array.isArray(photos)
        ? photos.length > 0 && typeof photos[0] === "object" && photos[0] && "count" in (photos[0] as Row)
          ? Number((photos[0] as Row).count) || 0
          : photos.length
        : 0;

  return {
    id: str(row.id),
    masterId: strOrNull(row.master_id),
    scheduleId: strOrNull(row.schedule_id),
    taskDate: str(row.task_date),
    masterName: str(row.master_name),
    areaId: strOrNull(row.area_id),
    areaLabel: strOrNull(row.area_label),
    categoryId: strOrNull(row.category_id),
    categoryLabel: strOrNull(row.category_label),
    timeSlot: oneOf<typeof TIME_SLOTS>(row.time_slot, TIME_SLOTS, "open_hours") as TimeSlotKey,
    fixedTime: strOrNull(row.fixed_time),
    dueAt: strOrNull(row.due_at),
    position: strOrNull(row.position),
    assigneeId: strOrNull(row.assignee_id),
    assigneeName: embeddedField(row.assignee, "display_name"),
    photoRequirement: oneOf<typeof PHOTO_REQUIREMENTS>(
      row.photo_requirement,
      PHOTO_REQUIREMENTS,
      "optional",
    ) as PhotoRequirement,
    priority: oneOf<typeof PRIORITIES>(row.priority, PRIORITIES, "normal") as Priority,
    estimatedMinutes: numOrNull(row.estimated_minutes),
    notes: strOrNull(row.notes),
    status: oneOf<typeof TASK_STATUSES>(row.status, TASK_STATUSES, "pending") as TaskStatus,
    wasOverdue: bool(row.was_overdue),
    source: row.source === "manual" ? "manual" : "auto",
    startedAt: strOrNull(row.started_at),
    startedByName: embeddedField(row.started_by_user, "display_name"),
    completedAt: strOrNull(row.completed_at),
    completedById: strOrNull(row.completed_by),
    completedByName: embeddedField(row.completed_by_user, "display_name"),
    actualMinutes: numOrNull(row.actual_minutes),
    comment: strOrNull(row.comment),
    skipReason: strOrNull(row.skip_reason),
    photoCount,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapLog(row: Row): CleaningLog {
  return {
    id: str(row.id),
    taskId: str(row.task_id),
    masterId: strOrNull(row.master_id),
    masterName: str(row.master_name),
    taskDate: str(row.task_date),
    action: oneOf<readonly LogAction[]>(
      row.action,
      ["generate", "start", "complete", "skip", "reopen", "uncomplete"] as const,
      "generate",
    ),
    statusAfter: oneOf<typeof TASK_STATUSES>(row.status_after, TASK_STATUSES, "pending") as TaskStatus,
    actorId: strOrNull(row.actor_id),
    actorName: embeddedField(row.actor, "display_name"),
    comment: strOrNull(row.comment),
    actualMinutes: numOrNull(row.actual_minutes),
    createdAt: str(row.created_at),
  };
}

export function mapPhoto(row: Row): CleaningPhoto {
  return {
    id: str(row.id),
    taskId: str(row.task_id),
    storagePath: str(row.storage_path),
    uploadedById: strOrNull(row.uploaded_by),
    bytes: numOrNull(row.bytes),
    createdAt: str(row.created_at),
    signedUrl: strOrNull(row.signed_url),
  };
}

export function mapNotificationSettings(row: Row): NotificationSettings {
  return {
    slackEnabled: bool(row.slack_enabled),
    slackWebhookUrl: strOrNull(row.slack_webhook_url),
    notifyDailyPlan: bool(row.notify_daily_plan, true),
    notifyOverdue: bool(row.notify_overdue, true),
    notifyClosingSummary: bool(row.notify_closing_summary, true),
    lastDailyPlanOn: strOrNull(row.last_daily_plan_on),
    lastClosingSummaryOn: strOrNull(row.last_closing_summary_on),
  };
}

function parseTimeSlots(v: unknown): TimeSlotConfig[] {
  if (!Array.isArray(v)) return DEFAULT_TIME_SLOTS;
  const out: TimeSlotConfig[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Row;
    const key = oneOf<typeof TIME_SLOTS>(o.key, TIME_SLOTS, "open_hours") as TimeSlotKey;
    out.push({
      key,
      label: str(o.label) || key,
      start: strOrNull(o.start),
      end: strOrNull(o.end),
    });
  }
  return out.length > 0 ? out : DEFAULT_TIME_SLOTS;
}

export function mapStoreSettings(row: Row): StoreSettings {
  return {
    storeName: str(row.store_name) || "店舗",
    timezone: str(row.timezone) || "Asia/Tokyo",
    openTime: (strOrNull(row.open_time) ?? "10:00").slice(0, 5),
    closeTime: (strOrNull(row.close_time) ?? "22:00").slice(0, 5),
    timeSlots: parseTimeSlots(row.time_slots),
    positions: Array.isArray(row.positions)
      ? (row.positions as unknown[]).map((p) => str(p)).filter(Boolean)
      : DEFAULT_POSITIONS,
  };
}
