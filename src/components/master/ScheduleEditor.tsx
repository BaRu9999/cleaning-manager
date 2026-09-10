"use client";

import {
  FREQUENCY_LABELS,
  FREQUENCIES,
  WEEKDAY_LABELS,
  type Frequency,
  type TimeSlotKey,
} from "@/config/constants";
import { cn } from "@/lib/cn";
import { Field, Select, TextInput } from "@/components/ui/Field";
import type { ScheduleDraft } from "./types";

const NEEDS_WEEKDAYS: Frequency[] = ["weekday", "weekly", "biweekly"];
const NEEDS_DOM: Frequency[] = ["monthly", "monthly_twice", "day_of_month"];

export function ScheduleEditor({
  value,
  index,
  timeSlots,
  onChange,
  onRemove,
}: {
  value: ScheduleDraft;
  index: number;
  timeSlots: { key: TimeSlotKey; label: string }[];
  onChange: (next: ScheduleDraft) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });

  const toggleWeekday = (d: number) =>
    set({
      weekdays: value.weekdays.includes(d)
        ? value.weekdays.filter((x) => x !== d)
        : [...value.weekdays, d].sort((a, b) => a - b),
    });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500">スケジュール {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-bold text-red-600 hover:underline"
        >
          削除
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="頻度" required>
          <Select
            value={value.frequency}
            onChange={(e) => set({ frequency: e.target.value as Frequency })}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="時間帯" required>
          <Select
            value={value.timeSlot}
            onChange={(e) => set({ timeSlot: e.target.value as TimeSlotKey })}
          >
            {timeSlots.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {NEEDS_WEEKDAYS.includes(value.frequency) ? (
        <div className="mt-3">
          <span className="mb-1 block text-sm font-bold text-slate-700">
            実施曜日{value.frequency !== "weekday" ? "（1つ選択）" : ""}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, d) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  value.frequency === "weekday"
                    ? toggleWeekday(d)
                    : set({ weekdays: [d] })
                }
                className={cn(
                  "tap h-10 w-10 rounded-full text-sm font-bold",
                  value.weekdays.includes(d)
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-600",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {NEEDS_DOM.includes(value.frequency) ? (
        <div className="mt-3">
          <Field
            label="実施日（1〜31、カンマ区切り）"
            required
            hint="例: 月1回=「10」、月2回=「10, 25」。存在しない日は月末に繰り上げ。"
          >
            <TextInput
              inputMode="numeric"
              placeholder="10, 25"
              value={value.daysOfMonthText}
              onChange={(e) => set({ daysOfMonthText: e.target.value })}
            />
          </Field>
        </div>
      ) : null}

      {value.frequency === "interval" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="間隔（日）" required>
            <TextInput
              inputMode="numeric"
              value={value.intervalDays ?? ""}
              onChange={(e) =>
                set({ intervalDays: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>
          <Field label="基準日" required hint="この日から N 日ごと">
            <TextInput
              type="date"
              value={value.anchorDate ?? ""}
              onChange={(e) => set({ anchorDate: e.target.value || null })}
            />
          </Field>
        </div>
      ) : null}

      {value.frequency === "biweekly" ? (
        <div className="mt-3">
          <Field label="起点の週（基準日）" required hint="この週を1回目として2週おき">
            <TextInput
              type="date"
              value={value.anchorDate ?? ""}
              onChange={(e) => set({ anchorDate: e.target.value || null })}
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {value.timeSlot === "fixed_time" ? (
          <Field label="実施時刻" required>
            <TextInput
              type="time"
              value={value.fixedTime ?? ""}
              onChange={(e) => set({ fixedTime: e.target.value || null })}
            />
          </Field>
        ) : null}
        <Field
          label="期限時刻（任意）"
          hint="この時刻を過ぎて未完了なら自動で「期限超過」。空欄なら時間帯の終了時刻。"
        >
          <TextInput
            type="time"
            value={value.dueTime ?? ""}
            onChange={(e) => set({ dueTime: e.target.value || null })}
          />
        </Field>
      </div>
    </div>
  );
}
