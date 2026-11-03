/**
 * DB 行（snake_case / PostgREST の JSON）→ ドメイン型（camelCase）の変換を集約。
 * 埋め込み（`select("*, area:cleaning_areas(name)")`）の揺れも吸収する。
 */

import type {
  EquipmentSeverity,
  EquipmentStatus,
  Frequency,
  PhotoRequirement,
  Priority,
  Role,
  TaskStatus,
  TimeSlotKey,
} from "@/config/constants";
import {
  CATEGORY_SIDES,
  DEFAULT_LINE_CLOSING_TIME,
  DEFAULT_LINE_MORNING_TIME,
  DEFAULT_LINE_PROGRESS_TIMES,
  DEFAULT_LINE_REMINDER_OFFSETS,
  DEFAULT_LINE_ROLE_PREFS,
  DEFAULT_POSITIONS,
  DEFAULT_TIME_SLOTS,
  EQUIPMENT_SEVERITIES,
  EQUIPMENT_STATUSES,
  FREQUENCIES,
  JOB_TITLES,
  LINE_NOTIFY_TYPES,
  PHOTO_REQUIREMENTS,
  PRIORITIES,
  ROLES,
  SKIP_REASON_CODES,
  TASK_STATUSES,
  TIME_SLOTS,
  type JobTitle,
  type LineNotifyType,
  type LineRolePrefs,
} from "@/config/constants";
import type {
  CleaningArea,
  CleaningCategory,
  CleaningLog,
  CleaningMaster,
  CleaningPhoto,
  CleaningSchedule,
  CleaningTask,
  DailyStaffing,
  EquipmentIssue,
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

/** oneOf の null 許容版（値が無い/不正なら null） */
function oneOfOrNull<T extends readonly string[]>(v: unknown, allowed: T): T[number] | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T[number])
    : null;
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
  const visible = row.visible_category_ids;
  // staff_line_accounts の埋め込み（配列 or オブジェクト）
  const laRaw = row.line_account;
  const la = (Array.isArray(laRaw) ? laRaw[0] : laRaw) as Row | null | undefined;
  const lineUserId =
    la && la.is_active !== false ? strOrNull(la.line_user_id) : null;
  return {
    id: str(row.id),
    email: strOrNull(row.email),
    displayName: str(row.display_name) || "(名称未設定)",
    role: oneOf<typeof ROLES>(row.role, ROLES, "staff") as Role,
    jobTitle: oneOf<typeof JOB_TITLES>(row.job_title, JOB_TITLES, "staff") as JobTitle,
    position: strOrNull(row.position),
    phone: strOrNull(row.phone),
    active: bool(row.active),
    staffCode: strOrNull(row.staff_code),
    visibleCategoryIds: Array.isArray(visible)
      ? visible.map((v) => str(v)).filter(Boolean)
      : null,
    lineUserId,
    lineLinked: lineUserId != null,
    hasLogin: bool(row.has_login, true),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function mapStaffLineAccount(row: Row) {
  return {
    id: str(row.id),
    staffId: str(row.staff_id),
    lineUserId: str(row.line_user_id),
    lineDisplayName: strOrNull(row.line_display_name),
    isActive: bool(row.is_active, true),
    registeredAt: str(row.registered_at),
    blockedAt: strOrNull(row.blocked_at),
  };
}

export function mapCategory(row: Row): CleaningCategory {
  return {
    id: str(row.id),
    name: str(row.name),
    side: oneOf<typeof CATEGORY_SIDES>(row.side, CATEGORY_SIDES, "other"),
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
    skipReasonCode: oneOfOrNull<typeof SKIP_REASON_CODES>(row.skip_reason_code, SKIP_REASON_CODES),
    assignmentLocked: bool(row.assignment_locked),
    originTaskId: strOrNull(row.origin_task_id),
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
      ["generate", "start", "complete", "skip", "reopen", "uncomplete", "carry_over"] as const,
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

function parseRolePrefs(v: unknown): LineRolePrefs {
  const base: LineRolePrefs = JSON.parse(JSON.stringify(DEFAULT_LINE_ROLE_PREFS));
  if (!v || typeof v !== "object") return base;
  const src = v as Record<string, unknown>;
  for (const job of JOB_TITLES) {
    const row = src[job];
    if (!row || typeof row !== "object") continue;
    for (const t of LINE_NOTIFY_TYPES) {
      const val = (row as Record<string, unknown>)[t];
      if (typeof val === "boolean") base[job as JobTitle][t as LineNotifyType] = val;
    }
  }
  return base;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function parseHHMM(v: unknown, fallback: string): string {
  const s = str(v).slice(0, 5);
  return HHMM_RE.test(s) ? s : fallback;
}
function parseHHMMList(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return [...fallback];
  const out = v.map((s) => str(s).slice(0, 5)).filter((s) => HHMM_RE.test(s));
  return out.length > 0 ? [...new Set(out)].sort() : [...fallback];
}
function parseOffsets(v: unknown): number[] {
  if (!Array.isArray(v)) return [...DEFAULT_LINE_REMINDER_OFFSETS];
  const out = v
    .map((n) => Math.trunc(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= -720 && n <= 720);
  return out.length > 0 ? [...new Set(out)].sort((a, b) => a - b) : [...DEFAULT_LINE_REMINDER_OFFSETS];
}

/**
 * 清掃の通知設定は2テーブルにまたがる:
 *   - cleaningRow: cleaning_notification_settings（Slack・送信済み日時。清掃専用、必須）
 *   - lineRow: notification_settings（LINE関連列のみ使用。棚卸し等と共有だが line_* は
 *     清掃専用の列なので読むだけなら問題ない。未取得/null なら LINE は既定値扱い）
 */
export function mapNotificationSettings(
  cleaningRow: Row,
  lineRow?: Row | null,
): NotificationSettings {
  const l = lineRow ?? {};
  return {
    slackEnabled: bool(cleaningRow.slack_enabled),
    slackWebhookUrl: strOrNull(cleaningRow.slack_webhook_url),
    notifyDailyPlan: bool(cleaningRow.notify_daily_plan, true),
    notifyOverdue: bool(cleaningRow.notify_overdue, true),
    notifyClosingSummary: bool(cleaningRow.notify_closing_summary, true),
    lastDailyPlanOn: strOrNull(cleaningRow.last_daily_plan_on),
    lastClosingSummaryOn: strOrNull(cleaningRow.last_closing_summary_on),
    lineEnabled: bool(l.line_enabled),
    lineChannelAccessToken: strOrNull(l.line_channel_access_token),
    lineChannelSecret: strOrNull(l.line_channel_secret),
    lineMorningTime: parseHHMM(l.line_morning_time, DEFAULT_LINE_MORNING_TIME),
    lineProgressTimes: parseHHMMList(l.line_progress_times, DEFAULT_LINE_PROGRESS_TIMES),
    lineReminderOffsets: parseOffsets(l.line_reminder_offsets),
    lineClosingTime: parseHHMM(l.line_closing_time, DEFAULT_LINE_CLOSING_TIME),
    lineRolePrefs: parseRolePrefs(l.line_role_prefs),
    lastLineMorningOn: strOrNull(l.last_line_morning_on),
    lastLineProgressAt: strOrNull(l.last_line_progress_at),
    lastLineClosingOn: strOrNull(l.last_line_closing_on),
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

export function mapDailyStaffing(row: Row): DailyStaffing {
  const positions = Array.isArray(row.positions)
    ? (row.positions as unknown[]).map((p) => str(p)).filter(Boolean)
    : [];
  return {
    id: str(row.id),
    workDate: str(row.work_date),
    userId: str(row.user_id),
    userName: embeddedField(row.user, "display_name") ?? "",
    position: strOrNull(row.position) ?? positions[0] ?? null,
    positions,
    startTime: strOrNull(row.start_time)?.slice(0, 5) ?? null,
    endTime: strOrNull(row.end_time)?.slice(0, 5) ?? null,
    availableForCleaning: bool(row.available_for_cleaning, true),
  };
}

export function mapEquipmentIssue(row: Row): EquipmentIssue {
  return {
    id: str(row.id),
    reportedAt: str(row.reported_at),
    reportedById: strOrNull(row.reported_by),
    reportedByName: embeddedField(row.reporter, "display_name"),
    taskId: strOrNull(row.task_id),
    masterId: strOrNull(row.master_id),
    masterName: embeddedField(row.master, "name"),
    areaId: strOrNull(row.area_id),
    areaName: embeddedField(row.area, "name"),
    title: str(row.title),
    description: strOrNull(row.description),
    severity: oneOf<typeof EQUIPMENT_SEVERITIES>(row.severity, EQUIPMENT_SEVERITIES, "medium") as EquipmentSeverity,
    status: oneOf<typeof EQUIPMENT_STATUSES>(row.status, EQUIPMENT_STATUSES, "open") as EquipmentStatus,
    photoPath: strOrNull(row.photo_path),
    resolvedAt: strOrNull(row.resolved_at),
    resolvedById: strOrNull(row.resolved_by),
    resolvedByName: embeddedField(row.resolver, "display_name"),
    resolutionNote: strOrNull(row.resolution_note),
    createdAt: str(row.created_at),
  };
}
