import { describe, expect, it } from "vitest";
import {
  buildClosingSummaryMessage,
  buildDailyPlanMessage,
  buildOverdueMessage,
} from "./messages";

describe("buildDailyPlanMessage", () => {
  it("仕様どおりの文面（時間帯ごとに項目を列挙）", () => {
    const msg = buildDailyPlanMessage({
      date: "2026-09-10",
      total: 12,
      slots: [
        { label: "営業前", names: ["入口ガラス", "レジ周辺"] },
        { label: "アイドル", names: ["冷蔵庫内部", "棚上部"] },
        { label: "閉店後", names: ["排水口", "電子レンジ"] },
      ],
    });
    expect(msg.text).toBe(
      [
        "【本日の清掃予定】",
        "",
        "本日の清掃予定は12件です。",
        "",
        "営業前",
        "・入口ガラス",
        "・レジ周辺",
        "",
        "アイドル",
        "・冷蔵庫内部",
        "・棚上部",
        "",
        "閉店後",
        "・排水口",
        "・電子レンジ",
      ].join("\n"),
    );
    expect(Array.isArray(msg.blocks)).toBe(true);
  });

  it("空の時間帯はスキップ", () => {
    const msg = buildDailyPlanMessage({
      date: "2026-09-10",
      total: 1,
      slots: [
        { label: "営業前", names: [] },
        { label: "閉店後", names: ["排水口"] },
      ],
    });
    expect(msg.text).not.toContain("営業前");
    expect(msg.text).toContain("閉店後\n・排水口");
  });
});

describe("buildOverdueMessage", () => {
  it("予定時刻・担当を含む", () => {
    const msg = buildOverdueMessage({
      masterName: "冷蔵庫内部清掃",
      dueAt: "2026-09-10T07:00:00.000Z", // 16:00 JST
      fixedTime: null,
      position: "キッチン",
      assigneeName: null,
    });
    expect(msg.text).toBe(
      [
        "【清掃未実施】",
        "",
        "冷蔵庫内部清掃が未実施です。",
        "",
        "予定時刻:",
        "16:00",
        "",
        "担当:",
        "キッチン",
      ].join("\n"),
    );
  });
});

describe("buildClosingSummaryMessage", () => {
  it("予定/完了/未実施/完了率と未実施項目名", () => {
    const msg = buildClosingSummaryMessage({
      date: "2026-09-10",
      planned: 12,
      done: 10,
      missed: 2,
      missedNames: ["冷蔵庫内部", "棚上部"],
    });
    expect(msg.text).toBe(
      [
        "【本日の清掃結果】",
        "",
        "予定:",
        "12件",
        "完了:",
        "10件",
        "未実施:",
        "2件",
        "完了率:",
        "83%",
        "",
        "未実施:",
        "・冷蔵庫内部",
        "・棚上部",
      ].join("\n"),
    );
  });

  it("0除算は 0%", () => {
    const msg = buildClosingSummaryMessage({
      date: "2026-09-10",
      planned: 0,
      done: 0,
      missed: 0,
      missedNames: [],
    });
    expect(msg.text).toContain("完了率:\n0%");
  });
});
