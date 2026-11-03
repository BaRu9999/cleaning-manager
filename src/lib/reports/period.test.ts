import { describe, expect, it } from "vitest";
import { getMonthRange, getWeekRange } from "./period";

describe("getWeekRange", () => {
  it("水曜日を基準にすると月曜〜日曜になる", () => {
    const r = getWeekRange("2026-10-14"); // 水
    expect(r.from).toBe("2026-10-12"); // 月
    expect(r.to).toBe("2026-10-18"); // 日
  });

  it("月曜日を基準にしてもその週のまま（月初扱いにならない）", () => {
    const r = getWeekRange("2026-10-12"); // 月
    expect(r.from).toBe("2026-10-12");
    expect(r.to).toBe("2026-10-18");
  });

  it("日曜日を基準にするとその週の最終日のまま", () => {
    const r = getWeekRange("2026-10-18"); // 日
    expect(r.from).toBe("2026-10-12");
    expect(r.to).toBe("2026-10-18");
  });

  it("月をまたぐ週も正しく計算する", () => {
    const r = getWeekRange("2026-11-02"); // 月（10月の週を含まない）
    expect(r.from).toBe("2026-11-02");
    expect(r.to).toBe("2026-11-08");
  });
});

describe("getMonthRange", () => {
  it("月の1日〜末日を返す", () => {
    const r = getMonthRange("2026-10-14");
    expect(r.from).toBe("2026-10-01");
    expect(r.to).toBe("2026-10-31");
  });

  it("うるう年2月も正しい末日になる", () => {
    const r = getMonthRange("2028-02-10");
    expect(r.to).toBe("2028-02-29");
  });
});
