import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_SLOTS } from "@/config/constants";
import { planTasksForDate, type GenMaster } from "./generate";

function master(p: Partial<GenMaster>): GenMaster {
  return {
    id: "m1",
    name: "テスト清掃",
    active: true,
    areaId: "a1",
    areaLabel: "シンク",
    categoryId: "c1",
    categoryLabel: "キッチン",
    position: "キッチン",
    defaultAssigneeId: null,
    photoRequirement: "optional",
    priority: "normal",
    estimatedMinutes: 5,
    notes: null,
    schedules: [],
    ...p,
  };
}

describe("planTasksForDate", () => {
  it("毎日スケジュール → 生成される。due_time から due_at を JST で計算", () => {
    const m = master({
      schedules: [
        {
          id: "s1",
          active: true,
          rule: {
            frequency: "daily",
            weekdays: [],
            daysOfMonth: [],
            intervalDays: null,
            anchorDate: null,
          },
          timeSlot: "closing",
          fixedTime: null,
          dueTime: "16:00",
        },
      ],
    });
    const rows = planTasksForDate([m], "2026-09-10", DEFAULT_TIME_SLOTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.masterName).toBe("テスト清掃");
    // 2026-09-10 16:00 JST = 07:00Z
    expect(rows[0]?.dueAt).toBe("2026-09-10T07:00:00.000Z");
  });

  it("due_time 未指定 → 時間帯の終了時刻をフォールバック（closing=23:00）", () => {
    const m = master({
      schedules: [
        {
          id: "s1",
          active: true,
          rule: {
            frequency: "daily",
            weekdays: [],
            daysOfMonth: [],
            intervalDays: null,
            anchorDate: null,
          },
          timeSlot: "closing",
          fixedTime: null,
          dueTime: null,
        },
      ],
    });
    const rows = planTasksForDate([m], "2026-09-10", DEFAULT_TIME_SLOTS);
    expect(rows[0]?.dueAt).toBe("2026-09-10T14:00:00.000Z"); // 23:00 JST
  });

  it("非対象日・無効マスタ・無効スケジュール・manual は生成しない", () => {
    const inactive = master({ id: "m2", active: false, schedules: [dailyS("s2")] });
    const manual = master({
      id: "m3",
      schedules: [
        {
          id: "s3",
          active: true,
          rule: {
            frequency: "manual",
            weekdays: [],
            daysOfMonth: [],
            intervalDays: null,
            anchorDate: null,
          },
          timeSlot: "open_hours",
          fixedTime: null,
          dueTime: null,
        },
      ],
    });
    const weekly = master({
      id: "m4",
      schedules: [
        {
          id: "s4",
          active: true,
          rule: {
            frequency: "weekly",
            weekdays: [1], // 月曜のみ
            daysOfMonth: [],
            intervalDays: null,
            anchorDate: null,
          },
          timeSlot: "idle",
          fixedTime: null,
          dueTime: null,
        },
      ],
    });
    // 2026-09-10 は木曜
    const rows = planTasksForDate([inactive, manual, weekly], "2026-09-10", DEFAULT_TIME_SLOTS);
    expect(rows).toHaveLength(0);
  });

  it("1マスタに複数スケジュール → それぞれ生成", () => {
    const m = master({ schedules: [dailyS("s1"), dailyS("s2")] });
    const rows = planTasksForDate([m], "2026-09-10", DEFAULT_TIME_SLOTS);
    expect(rows.map((r) => r.scheduleId).sort()).toEqual(["s1", "s2"]);
  });
});

function dailyS(id: string) {
  return {
    id,
    active: true,
    rule: {
      frequency: "daily" as const,
      weekdays: [],
      daysOfMonth: [],
      intervalDays: null,
      anchorDate: null,
    },
    timeSlot: "idle" as const,
    fixedTime: null,
    dueTime: null,
  };
}
