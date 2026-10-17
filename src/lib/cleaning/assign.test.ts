import { describe, expect, it } from "vitest";
import { assignCleaningTasks, type AssignStaff, type AssignTask } from "./assign";

function staff(id: string, position: string | null = null, available = true): AssignStaff {
  return {
    id,
    name: id,
    positions: position ? [position] : [],
    availableForCleaning: available,
    startTime: null,
    endTime: null,
  };
}

function task(p: Partial<AssignTask> & { id: string }): AssignTask {
  return {
    position: null,
    priority: "normal",
    estimatedMinutes: 10,
    status: "pending",
    assigneeId: null,
    assignmentLocked: false,
    dueTime: null,
    ...p,
  };
}

describe("assignCleaningTasks: 基本の均等化（LPT）", () => {
  it("30/20/15/10/5分 を A/B/C へ極端な偏りなく割り当てる", () => {
    const tasks = [
      task({ id: "t30", estimatedMinutes: 30 }),
      task({ id: "t20", estimatedMinutes: 20 }),
      task({ id: "t15", estimatedMinutes: 15 }),
      task({ id: "t10", estimatedMinutes: 10 }),
      task({ id: "t5", estimatedMinutes: 5 }),
    ];
    const result = assignCleaningTasks({ tasks, staff: [staff("A"), staff("B"), staff("C")] });

    expect(result.unassignedTaskIds).toHaveLength(0);
    const totals = result.loadByStaffId;
    const minutesList = Object.values(totals).map((l) => l.minutes);
    expect(Math.max(...minutesList) - Math.min(...minutesList)).toBeLessThanOrEqual(10);

    const by = Object.fromEntries(result.assignments.map((a) => [a.taskId, a.assigneeId]));
    expect(by.t30).toBe("A");
    expect(by.t20).toBe("B");
    expect(by.t15).toBe("C");
    expect(by.t10).toBe("C");
    expect(by.t5).toBe("B");
  });

  it("priority high を先に、estimated_minutes 大きい順に処理する", () => {
    const tasks = [
      task({ id: "low-30", estimatedMinutes: 30, priority: "low" }),
      task({ id: "high-5", estimatedMinutes: 5, priority: "high" }),
    ];
    // high-5 が先に処理される → 空いている方(どちらも0なので先頭)へ。
    // その後 low-30 は残り1名の中で最も空いている方へ。
    const result = assignCleaningTasks({ tasks, staff: [staff("A"), staff("B")] });
    const by = Object.fromEntries(result.assignments.map((a) => [a.taskId, a.assigneeId]));
    // high-5 は先に割り当てられ、low-30 は別の（より空いている）人になる
    expect(by["high-5"]).not.toBe(by["low-30"]);
  });
});

describe("assignCleaningTasks: ポジション制約", () => {
  it("position 不一致のスタッフへは割り当てない", () => {
    const tasks = [task({ id: "t1", position: "キッチン", estimatedMinutes: 15 })];
    const result = assignCleaningTasks({
      tasks,
      staff: [staff("hall1", "ホール"), staff("hall2", "ホール")],
    });
    expect(result.assignments).toHaveLength(0);
    expect(result.unassignedTaskIds).toEqual(["t1"]);
  });

  it("兼務（ホール・キッチン）のスタッフはどちらのタスクの候補にもなる", () => {
    const tasks = [
      task({ id: "hall-task", position: "ホール", estimatedMinutes: 10 }),
      task({ id: "kitchen-task", position: "キッチン", estimatedMinutes: 10 }),
    ];
    const both: AssignStaff = {
      id: "both",
      name: "both",
      positions: ["ホール", "キッチン"],
      availableForCleaning: true,
      startTime: null,
      endTime: null,
    };
    const result = assignCleaningTasks({ tasks, staff: [both] });
    expect(result.unassignedTaskIds).toHaveLength(0);
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.every((a) => a.assigneeId === "both")).toBe(true);
  });

  it("position 一致するスタッフだけが候補になる", () => {
    const tasks = [task({ id: "t1", position: "キッチン", estimatedMinutes: 15 })];
    const result = assignCleaningTasks({
      tasks,
      staff: [staff("hall1", "ホール"), staff("kitchen1", "キッチン")],
    });
    expect(result.assignments).toEqual([{ taskId: "t1", assigneeId: "kitchen1" }]);
  });
});

describe("assignCleaningTasks: ロック・進行中・完了済みは変更しない", () => {
  it("assignment_locked のタスクは担当を変更しない", () => {
    const tasks = [
      task({ id: "locked", assigneeId: "B", assignmentLocked: true, estimatedMinutes: 30 }),
      task({ id: "free", estimatedMinutes: 5 }),
    ];
    const result = assignCleaningTasks({ tasks, staff: [staff("A"), staff("B")] });
    // ロック済みタスクへの新規割当は発生しない
    expect(result.assignments.find((a) => a.taskId === "locked")).toBeUndefined();
    // ロック分の負荷(B=30分)を踏まえ、空いている A へ free が割り当てられる
    expect(result.assignments).toEqual([{ taskId: "free", assigneeId: "A" }]);
  });

  it("in_progress / done のタスクは再割当しない", () => {
    const tasks = [
      task({ id: "wip", status: "in_progress", assigneeId: "A", estimatedMinutes: 40 }),
      task({ id: "done", status: "done", assigneeId: "B", estimatedMinutes: 40 }),
      task({ id: "new", estimatedMinutes: 5 }),
    ];
    const result = assignCleaningTasks({ tasks, staff: [staff("A"), staff("B")] });
    expect(result.assignments.map((a) => a.taskId)).toEqual(["new"]);
    // A も B も同じ負荷(40分)なので先頭の A に付く
    expect(result.assignments[0]?.assigneeId).toBe("A");
  });

  it("欠勤スタッフに割当済みの in_progress/done は負荷計算にも影響しない候補外だが状態は保持される", () => {
    const tasks = [
      task({ id: "wip-absent", status: "in_progress", assigneeId: "ABSENT", estimatedMinutes: 40 }),
    ];
    const result = assignCleaningTasks({ tasks, staff: [staff("A")] });
    expect(result.assignments).toHaveLength(0);
    expect(result.unassignedTaskIds).toHaveLength(0); // 対象外（in_progress のため候補判定すらしない）
  });
});

describe("assignCleaningTasks: 固定担当者（出勤していれば維持）", () => {
  it("現在の担当者が本日出勤・ポジション適合なら維持する", () => {
    const tasks = [
      task({ id: "t1", assigneeId: "B", position: "キッチン", estimatedMinutes: 15 }),
    ];
    const result = assignCleaningTasks({
      tasks,
      staff: [staff("A", "キッチン"), staff("B", "キッチン")],
    });
    expect(result.assignments).toHaveLength(0); // 変更なし
    expect(result.loadByStaffId["B"]?.minutes).toBe(15);
  });

  it("現在の担当者が本日欠勤なら、出勤中の適合者へ再割当する", () => {
    const tasks = [
      task({ id: "t1", assigneeId: "ABSENT", position: "キッチン", estimatedMinutes: 15 }),
    ];
    const result = assignCleaningTasks({
      tasks,
      staff: [staff("A", "キッチン", true), staff("ABSENT", "キッチン", false)],
    });
    expect(result.assignments).toEqual([{ taskId: "t1", assigneeId: "A" }]);
  });
});

describe("assignCleaningTasks: シフトの勤務時間による制約", () => {
  function shiftStaff(id: string, startTime: string, endTime: string): AssignStaff {
    return { id, name: id, positions: [], availableForCleaning: true, startTime, endTime };
  }

  it("期限の時刻に勤務していないスタッフには割当しない", () => {
    const tasks = [task({ id: "morning", dueTime: "11:00", estimatedMinutes: 10 })];
    const result = assignCleaningTasks({
      tasks,
      staff: [shiftStaff("late", "17:00", "22:00")], // 11:00 にはまだ勤務していない
    });
    expect(result.assignments).toHaveLength(0);
    expect(result.unassignedTaskIds).toEqual(["morning"]);
  });

  it("期限の時刻に勤務中のスタッフへ割当する", () => {
    const tasks = [task({ id: "morning", dueTime: "11:00", estimatedMinutes: 10 })];
    const result = assignCleaningTasks({
      tasks,
      staff: [shiftStaff("early", "10:00", "15:00"), shiftStaff("late", "17:00", "22:00")],
    });
    expect(result.assignments).toEqual([{ taskId: "morning", assigneeId: "early" }]);
  });

  it("勤務時間が未設定のスタッフはシフト時間による制約を受けない", () => {
    const tasks = [task({ id: "morning", dueTime: "11:00", estimatedMinutes: 10 })];
    const result = assignCleaningTasks({ tasks, staff: [staff("A")] }); // startTime/endTime = null
    expect(result.assignments).toEqual([{ taskId: "morning", assigneeId: "A" }]);
  });

  it("現在の担当者が勤務時間外になったら、勤務中の適合者へ再割当する", () => {
    const tasks = [
      task({ id: "t1", assigneeId: "B", dueTime: "11:00", estimatedMinutes: 15 }),
    ];
    const result = assignCleaningTasks({
      tasks,
      staff: [shiftStaff("A", "10:00", "15:00"), shiftStaff("B", "17:00", "22:00")],
    });
    expect(result.assignments).toEqual([{ taskId: "t1", assigneeId: "A" }]);
  });
});
