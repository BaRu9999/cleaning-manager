import { z } from "zod";
import {
  FREQUENCIES,
  PHOTO_REQUIREMENTS,
  PRIORITIES,
  TIME_SLOTS,
} from "@/config/constants";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const nullableTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

export const scheduleInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    frequency: z.enum(FREQUENCIES),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    daysOfMonth: z.array(z.number().int().min(1).max(31)).max(15).default([]),
    intervalDays: z.number().int().min(1).max(365).nullable().default(null),
    anchorDate: z.string().regex(YMD).nullable().default(null),
    timeSlot: z.enum(TIME_SLOTS),
    fixedTime: z.string().regex(HHMM).nullable().default(null),
    dueTime: z.string().regex(HHMM).nullable().default(null),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === "weekday" && v.weekdays.length === 0) {
      ctx.addIssue({ code: "custom", message: "曜日を1つ以上選んでください", path: ["weekdays"] });
    }
    if ((v.frequency === "weekly" || v.frequency === "biweekly") && v.weekdays.length === 0) {
      ctx.addIssue({ code: "custom", message: "曜日を選んでください", path: ["weekdays"] });
    }
    if (
      (v.frequency === "monthly" ||
        v.frequency === "monthly_twice" ||
        v.frequency === "day_of_month") &&
      v.daysOfMonth.length === 0
    ) {
      ctx.addIssue({ code: "custom", message: "実施日を入力してください", path: ["daysOfMonth"] });
    }
    if (v.frequency === "interval" && (v.intervalDays == null || v.anchorDate == null)) {
      ctx.addIssue({ code: "custom", message: "間隔日数と基準日が必要です", path: ["intervalDays"] });
    }
    if (v.frequency === "biweekly" && v.anchorDate == null) {
      ctx.addIssue({ code: "custom", message: "基準日（起点の週）が必要です", path: ["anchorDate"] });
    }
    if (v.timeSlot === "fixed_time" && v.fixedTime == null) {
      ctx.addIssue({ code: "custom", message: "時刻を入力してください", path: ["fixedTime"] });
    }
  });

export const masterInputSchema = z.object({
  name: z.string().trim().min(1, "清掃名は必須です").max(120),
  areaId: z.string().uuid().nullable().default(null),
  categoryId: z.string().uuid().nullable().default(null),
  description: nullableTrimmed(2000),
  method: nullableTrimmed(2000),
  supplies: nullableTrimmed(1000),
  estimatedMinutes: z.number().int().min(0).max(600).nullable().default(null),
  position: nullableTrimmed(60),
  defaultAssigneeId: z.string().uuid().nullable().default(null),
  photoRequirement: z.enum(PHOTO_REQUIREMENTS).default("optional"),
  priority: z.enum(PRIORITIES).default("normal"),
  notes: nullableTrimmed(2000),
  active: z.boolean().default(true),
  schedules: z.array(scheduleInputSchema).max(10).default([]),
});

export type MasterInput = z.infer<typeof masterInputSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

/** zod エラーから最初の1件を日本語で取り出す */
export function firstIssue(error: z.ZodError): string {
  const i = error.issues[0];
  if (!i) return "入力内容を確認してください";
  const path = i.path.join(".");
  return path ? `${path}: ${i.message}` : i.message;
}
