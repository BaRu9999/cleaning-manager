import { describe, expect, it } from "vitest";
import { computeStaffWorkload, formatWorkload, getWorkloadRank } from "./workload";

describe("getWorkloadRank", () => {
  it("1〜5分 → S / 1pt", () => {
    expect(getWorkloadRank(1)).toEqual({ rank: "S", points: 1 });
    expect(getWorkloadRank(3)).toEqual({ rank: "S", points: 1 });
    expect(getWorkloadRank(5)).toEqual({ rank: "S", points: 1 });
  });

  it("6〜10分 → M / 2pt", () => {
    expect(getWorkloadRank(6)).toEqual({ rank: "M", points: 2 });
    expect(getWorkloadRank(10)).toEqual({ rank: "M", points: 2 });
  });

  it("11〜20分 → L / 3pt", () => {
    expect(getWorkloadRank(11)).toEqual({ rank: "L", points: 3 });
    expect(getWorkloadRank(20)).toEqual({ rank: "L", points: 3 });
  });

  it("21分以上 → XL / 5pt", () => {
    expect(getWorkloadRank(21)).toEqual({ rank: "XL", points: 5 });
    expect(getWorkloadRank(999)).toEqual({ rank: "XL", points: 5 });
  });

  it("null / undefined / 0以下 は未設定", () => {
    expect(getWorkloadRank(null)).toEqual({ rank: null, points: 0 });
    expect(getWorkloadRank(undefined)).toEqual({ rank: null, points: 0 });
    expect(getWorkloadRank(0)).toEqual({ rank: null, points: 0 });
    expect(getWorkloadRank(-5)).toEqual({ rank: null, points: 0 });
  });
});

describe("formatWorkload", () => {
  it("「約N分 / ランク」を返す", () => {
    expect(formatWorkload(20)).toBe("約20分 / L");
    expect(formatWorkload(3)).toBe("約3分 / S");
  });

  it("未設定なら「未設定」", () => {
    expect(formatWorkload(null)).toBe("未設定");
  });
});

describe("computeStaffWorkload", () => {
  it("担当者ごとに件数・合計時間・合計ポイントを集計する", () => {
    const rows = computeStaffWorkload([
      { assigneeId: "u1", assigneeName: "磯山", estimatedMinutes: 15, status: "pending" },
      { assigneeId: "u1", assigneeName: "磯山", estimatedMinutes: 10, status: "done" },
      { assigneeId: "u2", assigneeName: "青井", estimatedMinutes: 20, status: "pending" },
      { assigneeId: "u2", assigneeName: "青井", estimatedMinutes: 8, status: "skipped" }, // 除外
      { assigneeId: null, assigneeName: null, estimatedMinutes: 5, status: "pending" }, // 除外
    ]);
    expect(rows).toEqual([
      { staffId: "u1", staffName: "磯山", count: 2, totalMinutes: 25, totalPoints: 5 },
      { staffId: "u2", staffName: "青井", count: 1, totalMinutes: 20, totalPoints: 3 },
    ]);
  });
});
