import { describe, expect, it } from "vitest";
import { DEFAULT_LINE_ROLE_PREFS, type CategorySide } from "@/config/constants";
import {
  isOnDutyForNotification,
  planClosingRecipients,
  planMorningMessages,
  planPerTaskRecipients,
  planProgressRecipients,
  type LineTargetUser,
  type PlanTask,
} from "./recipients";

const sides = new Map<string, CategorySide>([
  ["hall", "hall"],
  ["kitchen", "kitchen"],
]);

function task(p: Partial<PlanTask>): PlanTask {
  return {
    id: "t" + Math.random().toString(36).slice(2, 6),
    masterName: "清掃",
    areaLabel: null,
    categoryId: "hall",
    assigneeId: null,
    assigneeName: null,
    dueLabel: "10:30",
    slotKey: "before_open",
    slotLabel: "営業前",
    status: "pending",
    estimatedMinutes: 10,
    ...p,
  };
}

const iso: LineTargetUser = {
  staffId: "iso",
  displayName: "磯山",
  jobTitle: "staff",
  visibleCategoryIds: null,
  lineUserId: "L-iso",
};
const leader: LineTargetUser = {
  staffId: "lead",
  displayName: "清掃リーダー",
  jobTitle: "cleaning_leader",
  visibleCategoryIds: null,
  lineUserId: "L-lead",
};
const hall: LineTargetUser = {
  staffId: "hall",
  displayName: "ホールリーダー",
  jobTitle: "hall_leader",
  visibleCategoryIds: null,
  lineUserId: "L-hall",
};
const manager: LineTargetUser = {
  staffId: "mgr",
  displayName: "店長",
  jobTitle: "manager",
  visibleCategoryIds: null,
  lineUserId: "L-mgr",
};

const tasks: PlanTask[] = [
  task({ masterName: "冷蔵庫内部", assigneeId: "iso", assigneeName: "磯山", categoryId: "kitchen", slotKey: "idle", slotLabel: "アイドル", dueLabel: "15:00" }),
  task({ masterName: "棚上部", assigneeId: "iso", assigneeName: "磯山", categoryId: "kitchen", slotKey: "idle", slotLabel: "アイドル", dueLabel: "17:00" }),
  task({ masterName: "レジ周辺", assigneeId: "aoi", assigneeName: "青井", categoryId: "hall", dueLabel: "11:00" }),
];

describe("isOnDutyForNotification", () => {
  it("manager は onDutyStaffIds に関わらず常に true", () => {
    expect(isOnDutyForNotification("manager", "mgr", null)).toBe(true);
    expect(isOnDutyForNotification("manager", "mgr", new Set())).toBe(true);
    expect(isOnDutyForNotification("manager", "mgr", new Set(["other"]))).toBe(true);
  });

  it("onDutyStaffIds が null（未設定日）なら全員 true（後方互換）", () => {
    expect(isOnDutyForNotification("staff", "iso", null)).toBe(true);
    expect(isOnDutyForNotification("cleaning_leader", "lead", null)).toBe(true);
    expect(isOnDutyForNotification("hall_leader", "hall", null)).toBe(true);
  });

  it("onDutyStaffIds が設定されていれば含まれるかで判定する", () => {
    const onDuty = new Set(["iso"]);
    expect(isOnDutyForNotification("staff", "iso", onDuty)).toBe(true);
    expect(isOnDutyForNotification("staff", "aoi", onDuty)).toBe(false);
    expect(isOnDutyForNotification("cleaning_leader", "lead", onDuty)).toBe(false);
    expect(isOnDutyForNotification("hall_leader", "hall", onDuty)).toBe(false);
  });
});

describe("planMorningMessages", () => {
  it("staff は自分の担当のみの flex_daily（他人の担当は含めない）", () => {
    const plan = planMorningMessages([iso], tasks, sides, DEFAULT_LINE_ROLE_PREFS);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.kind).toBe("flex_daily");
    expect(plan[0]!.tasks.map((t) => t.masterName)).toEqual(["冷蔵庫内部", "棚上部"]);
  });

  it("担当0件のスタッフには送らない", () => {
    const none: LineTargetUser = { ...iso, staffId: "none", lineUserId: "L-none" };
    expect(planMorningMessages([none], tasks, sides, DEFAULT_LINE_ROLE_PREFS)).toHaveLength(0);
  });

  it("cleaning_leader は digest（全体スケジュール）", () => {
    const plan = planMorningMessages([leader], tasks, sides, DEFAULT_LINE_ROLE_PREFS);
    expect(plan[0]!.kind).toBe("digest");
    expect(plan[0]!.tasks).toHaveLength(3);
  });

  it("hall_leader は既定でホール系のみ（hall / other）", () => {
    const plan = planMorningMessages([hall], tasks, sides, DEFAULT_LINE_ROLE_PREFS);
    expect(plan[0]!.kind).toBe("digest");
    expect(plan[0]!.tasks.map((t) => t.masterName)).toEqual(["レジ周辺"]);
  });

  it("担当者本人 かつ リーダー は digest 1通のみ（重複 lineUserId 排除・staff先勝ち）", () => {
    const dual: LineTargetUser = { ...leader, staffId: "iso", lineUserId: "L-iso" };
    const plan = planMorningMessages([iso, dual], tasks, sides, DEFAULT_LINE_ROLE_PREFS);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.kind).toBe("flex_daily");
  });

  it("morning が OFF の役職には送らない", () => {
    const prefs = JSON.parse(JSON.stringify(DEFAULT_LINE_ROLE_PREFS));
    prefs.cleaning_leader.morning = false;
    expect(planMorningMessages([leader], tasks, sides, prefs)).toHaveLength(0);
  });

  it("出勤ゲート: 当日出勤していない staff/leader には送らない。manager は常時対象", () => {
    const onDuty = new Set(["aoi"]); // iso, lead, hall は出勤していない
    expect(planMorningMessages([iso], tasks, sides, DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(0);
    expect(planMorningMessages([leader], tasks, sides, DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(0);
    expect(planMorningMessages([hall], tasks, sides, DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(0);
    expect(planMorningMessages([manager], tasks, sides, DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(1);
  });
});

describe("planProgressRecipients", () => {
  it("progress ON の役職へスコープ集計 ＋ 未実施リスト", () => {
    const withDone = [
      { ...tasks[0]!, status: "done" as const },
      tasks[1]!,
      tasks[2]!,
    ];
    const plan = planProgressRecipients([leader], withDone, sides, DEFAULT_LINE_ROLE_PREFS);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.planned).toBe(3);
    expect(plan[0]!.done).toBe(1);
    expect(plan[0]!.missed.map((t) => t.masterName)).toEqual(["棚上部", "レジ周辺"]);
  });

  it("staff は既定で progress OFF", () => {
    expect(planProgressRecipients([iso], tasks, sides, DEFAULT_LINE_ROLE_PREFS)).toHaveLength(0);
  });

  it("出勤ゲート: 当日出勤していない leader には送らない。manager は常時対象", () => {
    const onDuty = new Set(["aoi"]);
    expect(planProgressRecipients([leader], tasks, sides, DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(0);
    expect(planProgressRecipients([manager], tasks, sides, DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(1);
  });
});

describe("planPerTaskRecipients", () => {
  it("pending: staff は自分の対象タスクのみ", () => {
    const pend = tasks.map((t) => ({ ...t, status: "pending" as const }));
    const plan = planPerTaskRecipients("pending", [iso], pend, sides, DEFAULT_LINE_ROLE_PREFS);
    expect(plan[0]!.tasks.map((t) => t.masterName)).toEqual(["冷蔵庫内部", "棚上部"]);
  });

  it("overdue: 受信 OFF の役職には送らない", () => {
    const prefs = JSON.parse(JSON.stringify(DEFAULT_LINE_ROLE_PREFS));
    prefs.staff.overdue = false;
    const od = tasks.map((t) => ({ ...t, status: "overdue" as const }));
    expect(planPerTaskRecipients("overdue", [iso], od, sides, prefs)).toHaveLength(0);
  });

  it("出勤ゲート: 当日出勤していない staff には送らない。manager は常時対象", () => {
    const pend = tasks.map((t) => ({ ...t, status: "pending" as const }));
    const onDuty = new Set(["aoi"]);
    expect(planPerTaskRecipients("pending", [iso], pend, sides, DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(0);
    expect(planPerTaskRecipients("pending", [manager], pend, sides, DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(1);
  });
});

describe("planClosingRecipients", () => {
  it("closing ON の役職のみ（staff は既定 OFF）", () => {
    const rec = planClosingRecipients([iso, leader], DEFAULT_LINE_ROLE_PREFS);
    expect(rec.map((u) => u.staffId)).toEqual(["lead"]);
  });

  it("出勤ゲート: 当日出勤していない leader には送らない。manager は常時対象", () => {
    const onDuty = new Set(["aoi"]);
    expect(planClosingRecipients([leader], DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(0);
    expect(planClosingRecipients([manager], DEFAULT_LINE_ROLE_PREFS, onDuty)).toHaveLength(1);
  });
});
