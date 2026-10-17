import { describe, expect, it } from "vitest";
import { buildCarryOverRow, willRecurNaturally, type CarryOverSourceTask } from "./carry-over";

describe("willRecurNaturally", () => {
  it("翌日が通常の曜日スケジュールに合致するなら true", () => {
    // 2026-09-10 は木曜。翌日 2026-09-11 は金曜。
    const schedules = [
      { active: true, rule: { frequency: "weekly" as const, weekdays: [5], daysOfMonth: [], intervalDays: null, anchorDate: null } },
    ];
    expect(willRecurNaturally(schedules, "2026-09-11")).toBe(true);
  });

  it("翌日は対象外なら false", () => {
    const schedules = [
      { active: true, rule: { frequency: "weekly" as const, weekdays: [5], daysOfMonth: [], intervalDays: null, anchorDate: null } },
    ];
    expect(willRecurNaturally(schedules, "2026-09-12")).toBe(false);
  });

  it("無効化されたスケジュールは無視する", () => {
    const schedules = [
      { active: false, rule: { frequency: "daily" as const, weekdays: [], daysOfMonth: [], intervalDays: null, anchorDate: null } },
    ];
    expect(willRecurNaturally(schedules, "2026-09-11")).toBe(false);
  });
});

describe("buildCarryOverRow", () => {
  const source: CarryOverSourceTask = {
    id: "task-1",
    masterId: "m1",
    masterName: "冷蔵庫内部",
    areaId: "a1",
    areaLabel: "冷蔵庫",
    categoryId: "c1",
    categoryLabel: "キッチン",
    timeSlot: "idle",
    fixedTime: null,
    dueAt: "2026-09-10T08:00:00.000Z", // 17:00 JST
    position: "キッチン",
    assigneeId: "u1",
    photoRequirement: "required",
    priority: "high",
    estimatedMinutes: 20,
    notes: null,
  };

  it("元タスクの内容を引き継ぎ、新規 pending / manual として組み立てる", () => {
    const row = buildCarryOverRow(source, "2026-09-11");
    expect(row).toMatchObject({
      master_id: "m1",
      master_name: "冷蔵庫内部",
      task_date: "2026-09-11",
      status: "pending",
      source: "manual",
      origin_task_id: "task-1",
      photo_requirement: "required",
      priority: "high",
      assignee_id: "u1",
      estimated_minutes: 20,
    });
  });

  it("期限時刻(JSTの時刻)を保ったまま翌日の due_at を再計算する", () => {
    const row = buildCarryOverRow(source, "2026-09-11");
    expect(row.due_at).toBe("2026-09-11T08:00:00.000Z"); // 同じ 17:00 JST
  });

  it("期限が無ければ due_at は null のまま", () => {
    const row = buildCarryOverRow({ ...source, dueAt: null }, "2026-09-11");
    expect(row.due_at).toBeNull();
  });
});
