/**
 * ドメイン型（camelCase）。依存の根。他モジュールを import しない。
 * DB 行（snake_case）→ この型への変換は `src/lib/data/mappers.ts` に集約する。
 */

import type {
  Frequency,
  PhotoRequirement,
  Priority,
  Role,
  TaskStatus,
  TimeSlotConfig,
  TimeSlotKey,
} from "@/config/constants";

export type {
  Frequency,
  PhotoRequirement,
  Priority,
  Role,
  TaskStatus,
  TimeSlotConfig,
  TimeSlotKey,
};

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  role: Role;
  position: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CleaningCategory {
  id: string;
  name: string;
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
  | "uncomplete";

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
}

export interface StoreSettings {
  storeName: string;
  timezone: string;
  openTime: string;
  closeTime: string;
  timeSlots: TimeSlotConfig[];
  positions: string[];
}
