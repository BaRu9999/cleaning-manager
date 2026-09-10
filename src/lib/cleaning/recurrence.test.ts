import { describe, expect, it } from "vitest";
import {
  describeRule,
  occurrencesInRange,
  shouldRunOn,
  type RecurrenceRule,
} from "./recurrence";

function rule(partial: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    frequency: "manual",
    weekdays: [],
    daysOfMonth: [],
    intervalDays: null,
    anchorDate: null,
    ...partial,
  };
}

// 2026-09-01 は火曜。2026-09 は30日まで。
describe("shouldRunOn", () => {
  it("daily: 毎日 true", () => {
    expect(shouldRunOn(rule({ frequency: "daily" }), "2026-09-10")).toBe(true);
    expect(shouldRunOn(rule({ frequency: "daily" }), "2026-09-13")).toBe(true);
  });

  it("daily + weekdays: 指定曜日のみ（例: 定休の月曜を除く）", () => {
    const r = rule({ frequency: "daily", weekdays: [2, 3, 4, 5, 6, 0] }); // 月(1)以外
    expect(shouldRunOn(r, "2026-09-07")).toBe(false); // 月
    expect(shouldRunOn(r, "2026-09-08")).toBe(true); // 火
  });

  it("weekday: 複数曜日指定", () => {
    const r = rule({ frequency: "weekday", weekdays: [2, 4] }); // 火・木
    expect(shouldRunOn(r, "2026-09-08")).toBe(true); // 火
    expect(shouldRunOn(r, "2026-09-10")).toBe(true); // 木
    expect(shouldRunOn(r, "2026-09-09")).toBe(false); // 水
  });

  it("weekly: 週1回、その曜日だけ", () => {
    const r = rule({ frequency: "weekly", weekdays: [2] }); // 火
    expect(shouldRunOn(r, "2026-09-01")).toBe(true);
    expect(shouldRunOn(r, "2026-09-08")).toBe(true);
    expect(shouldRunOn(r, "2026-09-02")).toBe(false);
  });

  it("biweekly: anchor 週から2週おき", () => {
    const r = rule({ frequency: "biweekly", weekdays: [2], anchorDate: "2026-09-01" });
    expect(shouldRunOn(r, "2026-09-01")).toBe(true); // 0週
    expect(shouldRunOn(r, "2026-09-08")).toBe(false); // 1週
    expect(shouldRunOn(r, "2026-09-15")).toBe(true); // 2週
    expect(shouldRunOn(r, "2026-09-22")).toBe(false); // 3週
    expect(shouldRunOn(r, "2026-09-16")).toBe(false); // 水曜は対象外
  });

  it("monthly: 月末クランプ（31指定 → 9月は30日で発火）", () => {
    const r = rule({ frequency: "monthly", daysOfMonth: [31] });
    expect(shouldRunOn(r, "2026-09-30")).toBe(true);
    expect(shouldRunOn(r, "2026-09-29")).toBe(false);
    expect(shouldRunOn(r, "2026-10-31")).toBe(true);
  });

  it("monthly_twice: 2日指定", () => {
    const r = rule({ frequency: "monthly_twice", daysOfMonth: [10, 25] });
    expect(shouldRunOn(r, "2026-09-10")).toBe(true);
    expect(shouldRunOn(r, "2026-09-25")).toBe(true);
    expect(shouldRunOn(r, "2026-09-11")).toBe(false);
  });

  it("interval: anchor から N 日ごと", () => {
    const r = rule({ frequency: "interval", intervalDays: 3, anchorDate: "2026-09-01" });
    expect(shouldRunOn(r, "2026-09-01")).toBe(true);
    expect(shouldRunOn(r, "2026-09-04")).toBe(true);
    expect(shouldRunOn(r, "2026-09-05")).toBe(false);
    expect(shouldRunOn(r, "2026-08-29")).toBe(false); // anchor より前は対象外
  });

  it("manual: 常に false", () => {
    expect(shouldRunOn(rule({ frequency: "manual" }), "2026-09-10")).toBe(false);
  });
});

describe("occurrencesInRange", () => {
  it("毎週火曜を1ヶ月展開", () => {
    const r = rule({ frequency: "weekly", weekdays: [2] });
    expect(occurrencesInRange(r, "2026-09-01", "2026-09-30")).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
      "2026-09-29",
    ]);
  });
});

describe("describeRule", () => {
  it("読みやすい文字列", () => {
    expect(describeRule(rule({ frequency: "daily" }))).toBe("毎日");
    expect(describeRule(rule({ frequency: "weekly", weekdays: [2] }))).toBe("週1回 火曜");
    expect(describeRule(rule({ frequency: "monthly_twice", daysOfMonth: [10, 25] }))).toBe(
      "月2回 10・25日",
    );
  });
});
