import { describe, expect, it } from "vitest";
import {
  distinctDates,
  distinctNames,
  mapTanitaRoleToPositions,
  parseTanitaShiftCsv,
} from "./tanita";

const SAMPLE = [
  "date,name,role,start_time,end_time,hourly_rate,planned_headcount,actual_headcount,transport_cost,wage_cost,planned_labor_cost,employee_day_key,segment_index",
  "2026-09-01,青井,H・K,10:00,14:00,1987,1,1,0,7948,7948,2026-09-01__青井,1",
  "2026-09-01,青井,H・K,15:30,21:30,1987,1,1,0,11922,11922,2026-09-01__青井,2",
  "2026-09-01,磯山,H・K,10:00,15:30,1450,1,1,0,7975,7975,2026-09-01__磯山,1",
  "2026-09-01,島崎,H,11:30,16:30,1300,1,1,340,6500,6840,2026-09-01__島崎,1",
  "2026-09-02,笠井,K,10:00,15:00,1350,1,1,0,6750,6750,2026-09-02__笠井,1",
].join("\n");

describe("mapTanitaRoleToPositions", () => {
  it("H → ホール", () => {
    expect(mapTanitaRoleToPositions("H")).toEqual(["ホール"]);
  });
  it("K → キッチン", () => {
    expect(mapTanitaRoleToPositions("K")).toEqual(["キッチン"]);
  });
  it("H・K → ホール・キッチン兼務", () => {
    expect(mapTanitaRoleToPositions("H・K")).toEqual(["ホール", "キッチン"]);
  });
  it("不明な表記は空配列", () => {
    expect(mapTanitaRoleToPositions("")).toEqual([]);
  });
});

describe("parseTanitaShiftCsv", () => {
  it("同一日・同一氏名の複数セグメントを1件にマージする（開始=最早、終了=最遅）", () => {
    const { entries, error } = parseTanitaShiftCsv(SAMPLE);
    expect(error).toBeNull();
    const aoi = entries.find((e) => e.date === "2026-09-01" && e.name === "青井");
    expect(aoi).toEqual({
      date: "2026-09-01",
      name: "青井",
      positions: ["ホール", "キッチン"],
      startTime: "10:00",
      endTime: "21:30",
    });
  });

  it("H・K のスタッフはホールとキッチン両方を持つ", () => {
    const { entries } = parseTanitaShiftCsv(SAMPLE);
    const iso = entries.find((e) => e.name === "磯山")!;
    expect(iso.positions).toEqual(["ホール", "キッチン"]);
  });

  it("H のみのスタッフはホールだけ", () => {
    const { entries } = parseTanitaShiftCsv(SAMPLE);
    const shimazaki = entries.find((e) => e.name === "島崎")!;
    expect(shimazaki.positions).toEqual(["ホール"]);
  });

  it("行数（マージ前）を数える", () => {
    const { rowCount } = parseTanitaShiftCsv(SAMPLE);
    expect(rowCount).toBe(5);
  });

  it("必須列が無いCSVはエラーを返す", () => {
    const { error, entries } = parseTanitaShiftCsv("foo,bar\n1,2");
    expect(error).not.toBeNull();
    expect(entries).toHaveLength(0);
  });

  it("空文字はエラー", () => {
    expect(parseTanitaShiftCsv("").error).not.toBeNull();
  });
});

describe("distinctDates / distinctNames", () => {
  it("日付・氏名の重複無し一覧を返す", () => {
    const { entries } = parseTanitaShiftCsv(SAMPLE);
    expect(distinctDates(entries)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(distinctNames(entries)).toEqual(["笠井", "島崎", "磯山", "青井"].sort((a, b) => a.localeCompare(b, "ja")));
  });
});
