import { describe, expect, it } from "vitest";
import { buildCleaningReport } from "./build-report";
import { getWeekRange } from "./period";
import type { StatTask } from "@/lib/cleaning/stats";

function task(p: Partial<StatTask> & { taskDate: string; status: StatTask["status"] }): StatTask {
  return {
    masterId: "m1",
    masterName: "テスト項目",
    areaLabel: "テーブル",
    categoryLabel: "ホール",
    completedById: null,
    completedByName: null,
    ...p,
  };
}

describe("buildCleaningReport", () => {
  it("曜日別の行を月曜始まり7件で返し、指標が既存ロジックと一致する", () => {
    const period = getWeekRange("2026-10-14"); // 2026-10-12(月) 〜 2026-10-18(日)
    const tasks: StatTask[] = [
      task({ taskDate: "2026-10-12", status: "done" }), // 月
      task({ taskDate: "2026-10-12", status: "overdue" }), // 月
      task({ taskDate: "2026-10-18", status: "done" }), // 日
    ];
    const report = buildCleaningReport({
      tasks,
      period,
      periodType: "week",
      storeName: "テスト店舗",
      generatedAtLabel: "2026-10-19 09:00",
    });

    expect(report.periodType).toBe("week");
    expect(report.storeName).toBe("テスト店舗");
    expect(report.overall).toEqual({ planned: 3, done: 2, missed: 1, rate: 67 });

    expect(report.weekday).toHaveLength(7);
    expect(report.weekday.map((w) => w.label)).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
    const mon = report.weekday[0]!;
    expect(mon.planned).toBe(2);
    expect(mon.missed).toBe(1);
    expect(mon.missRate).toBe(50);
    const sun = report.weekday[6]!;
    expect(sun.planned).toBe(1);
    expect(sun.missed).toBe(0);
  });

  it("空データでもエラーにならず0件を返す", () => {
    const period = getWeekRange("2026-10-14");
    const report = buildCleaningReport({
      tasks: [],
      period,
      periodType: "week",
      storeName: "店舗",
      generatedAtLabel: "x",
    });
    expect(report.overall.planned).toBe(0);
    expect(report.worstAreas).toEqual([]);
    expect(report.missRanking).toEqual([]);
    expect(report.topStaff).toEqual([]);
    expect(report.weekday.every((w) => w.planned === 0)).toBe(true);
  });
});
