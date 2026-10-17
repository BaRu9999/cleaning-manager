import { describe, expect, it } from "vitest";
import {
  analyzeItemTimings,
  analyzeOverallTiming,
  analyzeStaffTiming,
  median,
  overrunRanking,
  recommendedRange,
  type TimingRecord,
} from "./time-analysis";

function rec(p: Partial<TimingRecord>): TimingRecord {
  return {
    masterId: "m1",
    masterName: "製氷機清掃",
    assigneeId: "u1",
    assigneeName: "磯山",
    estimatedMinutes: 15,
    actualMinutes: 20,
    ...p,
  };
}

describe("median", () => {
  it("奇数個は中央の値", () => {
    expect(median([10, 30, 20])).toBe(20);
  });
  it("偶数個は中央2つの平均", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
  it("空配列は0", () => {
    expect(median([])).toBe(0);
  });
});

describe("recommendedRange", () => {
  it("中央値23分 → 20〜25分", () => {
    expect(recommendedRange(23)).toEqual({ min: 20, max: 25 });
  });
  it("ちょうど5の倍数は幅を持たせる", () => {
    expect(recommendedRange(15)).toEqual({ min: 15, max: 20 });
  });
});

describe("analyzeItemTimings", () => {
  it("サンプル不足（3件未満）は sufficientSample=false, 推奨なし", () => {
    const records = [rec({ actualMinutes: 20 }), rec({ actualMinutes: 22 })];
    const [item] = analyzeItemTimings(records);
    expect(item!.count).toBe(2);
    expect(item!.sufficientSample).toBe(false);
    expect(item!.recommendedRange).toBeNull();
  });

  it("中央値と設定の差が20%以上なら推奨レンジを出す（設定15分・中央値23分の例）", () => {
    const records = [
      rec({ actualMinutes: 20 }),
      rec({ actualMinutes: 23 }),
      rec({ actualMinutes: 25 }),
      rec({ actualMinutes: 24 }),
    ];
    const [item] = analyzeItemTimings(records);
    expect(item!.sufficientSample).toBe(true);
    expect(item!.medianActual).toBe(23.5);
    expect(item!.diffPct).toBeGreaterThanOrEqual(20);
    expect(item!.recommendedRange).not.toBeNull();
  });

  it("差が20%未満なら推奨レンジを出さない", () => {
    const records = [
      rec({ estimatedMinutes: 20, actualMinutes: 20 }),
      rec({ estimatedMinutes: 20, actualMinutes: 21 }),
      rec({ estimatedMinutes: 20, actualMinutes: 22 }),
    ];
    const [item] = analyzeItemTimings(records);
    expect(item!.recommendedRange).toBeNull();
  });

  it("estimatedMinutes が無い場合は diff を計算しない", () => {
    const records = [
      rec({ estimatedMinutes: null, actualMinutes: 20 }),
      rec({ estimatedMinutes: null, actualMinutes: 22 }),
      rec({ estimatedMinutes: null, actualMinutes: 24 }),
    ];
    const [item] = analyzeItemTimings(records);
    expect(item!.currentEstimate).toBeNull();
    expect(item!.diffPct).toBeNull();
    expect(item!.recommendedRange).toBeNull();
  });
});

describe("analyzeOverallTiming", () => {
  it("平均・差・超過率を集計する", () => {
    const records = [
      rec({ estimatedMinutes: 10, actualMinutes: 12 }),
      rec({ estimatedMinutes: 10, actualMinutes: 8 }),
      rec({ estimatedMinutes: 10, actualMinutes: 15 }),
    ];
    const r = analyzeOverallTiming(records);
    expect(r.count).toBe(3);
    expect(r.avgEstimated).toBe(10);
    expect(r.avgActual).toBeCloseTo(11.7, 1);
    expect(r.overrunRatePct).toBe(67); // 2/3
  });

  it("空配列は0埋め", () => {
    expect(analyzeOverallTiming([])).toEqual({
      count: 0,
      avgEstimated: null,
      avgActual: 0,
      diffMinutes: null,
      overrunRatePct: 0,
    });
  });
});

describe("analyzeStaffTiming", () => {
  it("スタッフ別に平均実績時間を集計し降順で返す", () => {
    const records = [
      rec({ assigneeId: "u1", assigneeName: "磯山", actualMinutes: 10 }),
      rec({ assigneeId: "u1", assigneeName: "磯山", actualMinutes: 20 }),
      rec({ assigneeId: "u2", assigneeName: "青井", actualMinutes: 30 }),
    ];
    const rows = analyzeStaffTiming(records);
    expect(rows[0]).toEqual({ staffId: "u2", staffName: "青井", count: 1, avgActual: 30 });
    expect(rows[1]).toEqual({ staffId: "u1", staffName: "磯山", count: 2, avgActual: 15 });
  });
});

describe("overrunRanking", () => {
  it("サンプル十分・実績が設定を上回る項目のみ、乖離率の高い順", () => {
    const items = analyzeItemTimings([
      ...[20, 23, 25].map((a) => rec({ masterId: "m1", masterName: "A", estimatedMinutes: 15, actualMinutes: a })),
      ...[9, 9, 9].map((a) => rec({ masterId: "m2", masterName: "B", estimatedMinutes: 10, actualMinutes: a })), // 短縮 → 除外
      ...[30].map((a) => rec({ masterId: "m3", masterName: "C", estimatedMinutes: 10, actualMinutes: a })), // サンプル不足 → 除外
    ]);
    const ranking = overrunRanking(items);
    expect(ranking.map((i) => i.masterName)).toEqual(["A"]);
  });
});
