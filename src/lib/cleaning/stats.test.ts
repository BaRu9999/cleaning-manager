import { describe, expect, it } from "vitest";
import {
  completionByArea,
  implementationByStaff,
  missRanking,
  missedByWeekday,
  overallCompletion,
  type StatTask,
} from "./stats";

function t(p: Partial<StatTask>): StatTask {
  return {
    taskDate: "2026-09-10",
    status: "done",
    masterId: "m1",
    masterName: "テーブル拭き",
    areaLabel: "テーブル",
    categoryLabel: "ホール",
    completedById: "u1",
    completedByName: "山田",
    ...p,
  };
}

describe("overallCompletion", () => {
  it("skipped は母数から除外、rate は done/planned", () => {
    const tasks = [
      t({ status: "done" }),
      t({ status: "done" }),
      t({ status: "overdue" }),
      t({ status: "pending" }),
      t({ status: "skipped" }),
    ];
    const c = overallCompletion(tasks);
    expect(c.planned).toBe(4);
    expect(c.done).toBe(2);
    expect(c.missed).toBe(2);
    expect(c.rate).toBe(50);
  });

  it("空配列は 0", () => {
    expect(overallCompletion([])).toEqual({ planned: 0, done: 0, missed: 0, rate: 0 });
  });
});

describe("completionByArea", () => {
  it("完了率の低い順に並ぶ", () => {
    const tasks = [
      t({ areaLabel: "床", status: "overdue" }),
      t({ areaLabel: "床", status: "overdue" }),
      t({ areaLabel: "テーブル", status: "done" }),
      t({ areaLabel: "テーブル", status: "done" }),
    ];
    const rows = completionByArea(tasks);
    expect(rows[0]?.label).toBe("床");
    expect(rows[0]?.rate).toBe(0);
    expect(rows[1]?.label).toBe("テーブル");
    expect(rows[1]?.rate).toBe(100);
  });
});

describe("implementationByStaff", () => {
  it("完了者ごとに件数、多い順", () => {
    const tasks = [
      t({ completedById: "u1", completedByName: "山田", status: "done" }),
      t({ completedById: "u1", completedByName: "山田", status: "done" }),
      t({ completedById: "u2", completedByName: "佐藤", status: "done" }),
      t({ completedById: "u2", completedByName: "佐藤", status: "overdue" }),
    ];
    const rows = implementationByStaff(tasks);
    expect(rows).toEqual([
      { id: "u1", name: "山田", done: 2 },
      { id: "u2", name: "佐藤", done: 1 },
    ]);
  });
});

describe("missedByWeekday", () => {
  it("曜日別に未実施を数える（2026-09-10 は木=4）", () => {
    const rows = missedByWeekday([
      t({ taskDate: "2026-09-10", status: "overdue" }),
      t({ taskDate: "2026-09-10", status: "done" }),
    ]);
    expect(rows[4]).toEqual({ weekday: 4, planned: 2, missed: 1 });
    expect(rows[0]).toEqual({ weekday: 0, planned: 0, missed: 0 });
  });
});

describe("missRanking", () => {
  it("未実施率の高い順、minPlanned 未満は除外", () => {
    const many = (id: string, name: string, done: number, missed: number) => [
      ...Array.from({ length: done }, () => t({ masterId: id, masterName: name, status: "done" as const })),
      ...Array.from({ length: missed }, () => t({ masterId: id, masterName: name, status: "overdue" as const })),
    ];
    const tasks = [
      ...many("m1", "冷蔵庫内部", 8, 2), // 20%
      ...many("m2", "棚上部", 9, 1), // 10%
      ...many("m3", "レア", 1, 1), // planned=2 → 除外
    ];
    const rows = missRanking(tasks, { minPlanned: 3 });
    expect(rows.map((r) => r.masterName)).toEqual(["冷蔵庫内部", "棚上部"]);
    expect(rows[0]?.missRate).toBe(20);
  });
});
