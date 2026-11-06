import { describe, expect, it } from "vitest";
import {
  applyFulfillment,
  findFulfillment,
  findPreviousOccurrence,
  isPullForwardEligible,
  type DoneTaskForFulfillment,
} from "./pull-forward";
import type { RecurrenceRule } from "./recurrence";

describe("isPullForwardEligible", () => {
  it("daily と manual は対象外", () => {
    expect(isPullForwardEligible("daily")).toBe(false);
    expect(isPullForwardEligible("manual")).toBe(false);
  });

  it("interval・weekly などは対象", () => {
    expect(isPullForwardEligible("interval")).toBe(true);
    expect(isPullForwardEligible("weekly")).toBe(true);
    expect(isPullForwardEligible("biweekly")).toBe(true);
    expect(isPullForwardEligible("monthly")).toBe(true);
    expect(isPullForwardEligible("day_of_month")).toBe(true);
  });
});

describe("findPreviousOccurrence", () => {
  it("interval: 3日ごと（起点2026-09-01）で2026-09-10より前の直近発生日は2026-09-07", () => {
    const rule: RecurrenceRule = {
      frequency: "interval",
      weekdays: [],
      daysOfMonth: [],
      intervalDays: 3,
      anchorDate: "2026-09-01",
    };
    expect(findPreviousOccurrence(rule, "2026-09-10")).toBe("2026-09-07");
  });

  it("weekly: 毎週木曜で2026-09-10(木)より前の直近発生日は2026-09-03", () => {
    // 2026-09-10 は木曜（dow=4）
    const rule: RecurrenceRule = {
      frequency: "weekly",
      weekdays: [4],
      daysOfMonth: [],
      intervalDays: null,
      anchorDate: null,
    };
    expect(findPreviousOccurrence(rule, "2026-09-10")).toBe("2026-09-03");
  });

  it("起点日そのものが初回発生なら、それより前には発生が無いため null", () => {
    const rule: RecurrenceRule = {
      frequency: "interval",
      weekdays: [],
      daysOfMonth: [],
      intervalDays: 3,
      anchorDate: "2026-09-10",
    };
    expect(findPreviousOccurrence(rule, "2026-09-10")).toBeNull();
  });
});

describe("findFulfillment", () => {
  const doneTasks: DoneTaskForFulfillment[] = [
    { id: "t1", taskDate: "2026-09-07", completedAt: "2026-09-07T05:00:00.000Z", completedById: "u1" },
    { id: "t2", taskDate: "2026-09-09", completedAt: "2026-09-09T05:00:00.000Z", completedById: "u2" },
  ];

  it("直前の発生日(除外)〜対象日(除外)の間に完了タスクがあれば、最新のものを返す", () => {
    const result = findFulfillment(doneTasks, "2026-09-07", "2026-09-10");
    expect(result).toEqual({
      taskId: "t2",
      taskDate: "2026-09-09",
      completedAt: "2026-09-09T05:00:00.000Z",
      completedById: "u2",
    });
  });

  it("直前の発生日と同日の完了タスクは対象外（境界は除外）", () => {
    const result = findFulfillment(
      [{ id: "t0", taskDate: "2026-09-07", completedAt: null, completedById: null }],
      "2026-09-07",
      "2026-09-10",
    );
    expect(result).toBeNull();
  });

  it("対象日と同日の完了タスクは対象外（通常の当日生成として扱う）", () => {
    const result = findFulfillment(
      [{ id: "t0", taskDate: "2026-09-10", completedAt: null, completedById: null }],
      "2026-09-07",
      "2026-09-10",
    );
    expect(result).toBeNull();
  });

  it("窓の中に完了タスクが無ければ null", () => {
    expect(findFulfillment([], "2026-09-07", "2026-09-10")).toBeNull();
  });
});

describe("applyFulfillment", () => {
  it("予定タスク行を前倒し消化済み(done)へ上書きする", () => {
    const row = {
      master_id: "m1",
      task_date: "2026-09-10",
      status: "pending",
    };
    const result = applyFulfillment(row, {
      taskId: "t2",
      taskDate: "2026-09-09",
      completedAt: "2026-09-09T05:00:00.000Z",
      completedById: "u2",
    });
    expect(result).toEqual({
      master_id: "m1",
      task_date: "2026-09-10",
      status: "done",
      completed_at: "2026-09-09T05:00:00.000Z",
      completed_by: "u2",
      comment: "前倒し消化（2026-09-09 実施分で充足）",
      fulfilled_by_task_id: "t2",
    });
  });
});
