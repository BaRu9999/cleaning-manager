import type {
  Frequency,
  PhotoRequirement,
  Priority,
  TimeSlotKey,
} from "@/config/constants";

/** MasterForm 内で編集するスケジュール1件の下書き */
export interface ScheduleDraft {
  /** ローカル識別子（React key 用。保存時は使わない） */
  key: string;
  /** 既存スケジュールの ID（新規は undefined） */
  id?: string;
  frequency: Frequency;
  weekdays: number[];
  /** "10, 25" のような入力を保持（保存時に数値配列へ） */
  daysOfMonthText: string;
  intervalDays: number | null;
  anchorDate: string | null;
  timeSlot: TimeSlotKey;
  fixedTime: string | null;
  dueTime: string | null;
  active: boolean;
}

export interface MasterFormInitial {
  id: string;
  name: string;
  areaId: string | null;
  categoryId: string | null;
  description: string | null;
  method: string | null;
  supplies: string | null;
  estimatedMinutes: number | null;
  position: string | null;
  defaultAssigneeId: string | null;
  photoRequirement: PhotoRequirement;
  priority: Priority;
  notes: string | null;
  active: boolean;
  schedules: ScheduleDraft[];
}

export interface MasterFormOptions {
  categories: { id: string; name: string }[];
  areas: { id: string; name: string; categoryId: string }[];
  users: { id: string; displayName: string; position: string | null }[];
  positions: string[];
  timeSlots: { key: TimeSlotKey; label: string }[];
}

export function newScheduleDraft(): ScheduleDraft {
  return {
    key: Math.random().toString(36).slice(2),
    frequency: "daily",
    weekdays: [],
    daysOfMonthText: "",
    intervalDays: null,
    anchorDate: null,
    timeSlot: "before_open",
    fixedTime: null,
    dueTime: null,
    active: true,
  };
}
