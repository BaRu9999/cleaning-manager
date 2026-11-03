/**
 * ドメイン型（camelCase）。依存の根。他モジュールを import しない。
 * DB 行（snake_case）→ この型への変換は `src/lib/data/mappers.ts` に集約する。
 */

import type {
  CategorySide,
  EquipmentSeverity,
  EquipmentStatus,
  Frequency,
  JobTitle,
  LineRolePrefs,
  PhotoRequirement,
  Priority,
  Role,
  SkipReasonCode,
  TaskStatus,
  TimeSlotConfig,
  TimeSlotKey,
} from "@/config/constants";

export type {
  CategorySide,
  EquipmentSeverity,
  EquipmentStatus,
  Frequency,
  JobTitle,
  LineRolePrefs,
  PhotoRequirement,
  Priority,
  Role,
  SkipReasonCode,
  TaskStatus,
  TimeSlotConfig,
  TimeSlotKey,
};

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  role: Role;
  jobTitle: JobTitle;
  position: string | null;
  phone: string | null;
  active: boolean;
  staffCode: string | null;
  /** null = 全カテゴリー閲覧可 */
  visibleCategoryIds: string[] | null;
  /** staff_line_accounts の JOIN で埋まる（無ければ null / false） */
  lineUserId: string | null;
  lineLinked: boolean;
  /** false = シフトCSV連携のみで作成された行（ログイン・LINE通知は利用不可） */
  hasLogin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffLineAccount {
  id: string;
  staffId: string;
  lineUserId: string;
  lineDisplayName: string | null;
  isActive: boolean;
  registeredAt: string;
  blockedAt: string | null;
}

export interface CleaningCategory {
  id: string;
  name: string;
  side: CategorySide;
  sortOrder: number;
  active: boolean;
}

export interface CleaningArea {
  id: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface CleaningSchedule {
  id: string;
  masterId: string;
  frequency: Frequency;
  weekdays: number[];
  daysOfMonth: number[];
  intervalDays: number | null;
  anchorDate: string | null;
  timeSlot: TimeSlotKey;
  fixedTime: string | null;
  dueTime: string | null;
  active: boolean;
}

export interface CleaningMaster {
  id: string;
  name: string;
  areaId: string | null;
  areaName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  description: string | null;
  method: string | null;
  supplies: string | null;
  estimatedMinutes: number | null;
  position: string | null;
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
  photoRequirement: PhotoRequirement;
  priority: Priority;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  schedules: CleaningSchedule[];
}

export interface CleaningTask {
  id: string;
  masterId: string | null;
  scheduleId: string | null;
  taskDate: string;
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
  assigneeName: string | null;
  photoRequirement: PhotoRequirement;
  priority: Priority;
  estimatedMinutes: number | null;
  notes: string | null;
  status: TaskStatus;
  wasOverdue: boolean;
  source: "auto" | "manual";
  startedAt: string | null;
  startedByName: string | null;
  completedAt: string | null;
  completedById: string | null;
  completedByName: string | null;
  actualMinutes: number | null;
  comment: string | null;
  skipReason: string | null;
  skipReasonCode: SkipReasonCode | null;
  /** 管理者/担当者が手動で担当を固定した場合 true。自動割当で上書きしない */
  assignmentLocked: boolean;
  /** 前日の実施不可タスクから繰り越された場合、その元タスクの ID */
  originTaskId: string | null;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export type LogAction =
  | "generate"
  | "start"
  | "complete"
  | "skip"
  | "reopen"
  | "uncomplete"
  | "carry_over";

export interface CleaningLog {
  id: string;
  taskId: string;
  masterId: string | null;
  masterName: string;
  taskDate: string;
  action: LogAction;
  statusAfter: TaskStatus;
  actorId: string | null;
  actorName: string | null;
  comment: string | null;
  actualMinutes: number | null;
  createdAt: string;
}

export interface CleaningPhoto {
  id: string;
  taskId: string;
  storagePath: string;
  uploadedById: string | null;
  bytes: number | null;
  createdAt: string;
  /** サーバーで発行した表示用の署名付きURL（一覧取得時のみ埋める） */
  signedUrl?: string | null;
}

export interface NotificationSettings {
  slackEnabled: boolean;
  slackWebhookUrl: string | null;
  notifyDailyPlan: boolean;
  notifyOverdue: boolean;
  notifyClosingSummary: boolean;
  lastDailyPlanOn: string | null;
  lastClosingSummaryOn: string | null;
  // --- LINE ---
  lineEnabled: boolean;
  lineChannelAccessToken: string | null;
  lineChannelSecret: string | null;
  /** 朝の清掃予定通知の時刻 "HH:MM" */
  lineMorningTime: string;
  /** 途中進捗通知の時刻（複数可） */
  lineProgressTimes: string[];
  /** 未実施通知（期限前リマインド）の分オフセット。負=前 / 0=時刻 / 正=後 */
  lineReminderOffsets: number[];
  /** 閉店後レポートの時刻 "HH:MM" */
  lineClosingTime: string;
  /** 役職 × 通知種別（morning/progress/pending/overdue/closing）の受信可否 */
  lineRolePrefs: LineRolePrefs;
  lastLineMorningOn: string | null;
  lastLineProgressAt: string | null;
  lastLineClosingOn: string | null;
}

export interface StoreSettings {
  storeName: string;
  timezone: string;
  openTime: string;
  closeTime: string;
  timeSlots: TimeSlotConfig[];
  positions: string[];
}

/** 当日の出勤スタッフ（清掃自動割当の母集団） */
export interface DailyStaffing {
  id: string;
  workDate: string;
  userId: string;
  userName: string;
  /** 表示用の代表ポジション（先頭の positions、無ければ null） */
  position: string | null;
  /** 本日対応できるポジション（複数可。シフト連携の兼務対応） */
  positions: string[];
  startTime: string | null;
  endTime: string | null;
  availableForCleaning: boolean;
}

export interface EquipmentIssue {
  id: string;
  reportedAt: string;
  reportedById: string | null;
  reportedByName: string | null;
  taskId: string | null;
  masterId: string | null;
  masterName: string | null;
  areaId: string | null;
  areaName: string | null;
  title: string;
  description: string | null;
  severity: EquipmentSeverity;
  status: EquipmentStatus;
  photoPath: string | null;
  photoSignedUrl?: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  createdAt: string;
}
