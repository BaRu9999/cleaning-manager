import { describe, expect, it } from "vitest";
import { carryOverOneTask, runAutoCarryOver } from "./run-carry-over";
import type { CarryOverSourceTask } from "./carry-over";

const source: CarryOverSourceTask = {
  id: "task-1",
  masterId: "m1",
  masterName: "冷蔵庫内部",
  areaId: "a1",
  areaLabel: "冷蔵庫",
  categoryId: "c1",
  categoryLabel: "キッチン",
  timeSlot: "idle",
  fixedTime: null,
  dueAt: null,
  position: "キッチン",
  assigneeId: "staff-1",
  photoRequirement: "optional",
  priority: "normal",
  estimatedMinutes: 10,
  notes: null,
};

/**
 * 1回の .from(table) につき1つの結果を返す簡易モック。
 * select/insert/eq は素通りのチェーン、.in()/.single() および直接の await（.then）で解決する
 * （supabase-js の PostgrestFilterBuilder が「どこで await されても結果を返す」挙動を模す）。
 */
function makeClient(handlers: Record<string, (() => unknown)[]>) {
  const calls: { table: string }[] = [];
  const client = {
    from(table: string) {
      calls.push({ table });
      const queue = handlers[table] ?? [];
      const handler = queue.shift();
      if (!handler) throw new Error(`unexpected .from("${table}") call (handler queue empty)`);
      const result = handler();
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: () => builder,
        eq: () => builder,
        in: () => Promise.resolve(result),
        single: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };
  return { client, calls };
}

describe("carryOverOneTask", () => {
  it("翌日も通常スケジュールで発生するなら繰越タスクを作らない", async () => {
    const { client, calls } = makeClient({
      cleaning_schedules: [
        () => ({
          data: [
            {
              active: true,
              frequency: "daily",
              weekdays: [],
              days_of_month: [],
              interval_days: null,
              anchor_date: null,
            },
          ],
          error: null,
        }),
      ],
    });
    const result = await carryOverOneTask(client as never, source, "2026-11-04", {
      actorId: "admin-1",
      comment: "test",
    });
    expect(result).toEqual({ carried: false, skippedNaturalRecur: true });
    expect(calls.some((c) => c.table === "cleaning_tasks")).toBe(false);
  });

  it("自然発生しないなら繰越タスクと履歴ログを作る", async () => {
    const { client, calls } = makeClient({
      cleaning_schedules: [() => ({ data: [], error: null })],
      cleaning_tasks: [() => ({ data: { id: "new-task-1" }, error: null })],
      cleaning_logs: [() => ({ data: null, error: null })],
    });
    const result = await carryOverOneTask(client as never, source, "2026-11-04", {
      actorId: "admin-1",
      comment: "前日に未実施のため自動繰越",
    });
    expect(result).toEqual({ carried: true, skippedNaturalRecur: false, newTaskId: "new-task-1" });
    expect(calls.filter((c) => c.table === "cleaning_logs")).toHaveLength(1);
  });

  it("master_id が無いタスクはスケジュール確認をせず常に繰り越す", async () => {
    const { client, calls } = makeClient({
      cleaning_tasks: [() => ({ data: { id: "new-task-2" }, error: null })],
      cleaning_logs: [() => ({ data: null, error: null })],
    });
    const manual: CarryOverSourceTask = { ...source, masterId: null };
    const result = await carryOverOneTask(client as never, manual, "2026-11-04", {
      actorId: null,
      comment: "x",
    });
    expect(result.carried).toBe(true);
    expect(calls.some((c) => c.table === "cleaning_schedules")).toBe(false);
  });

  it("挿入エラーは例外として投げる（呼び出し側の catch で fail() にできる）", async () => {
    const { client } = makeClient({
      cleaning_schedules: [() => ({ data: [], error: null })],
      cleaning_tasks: [() => ({ data: null, error: { message: "db down" } })],
    });
    await expect(
      carryOverOneTask(client as never, source, "2026-11-04", { actorId: null, comment: "x" }),
    ).rejects.toThrow("db down");
  });
});

describe("runAutoCarryOver", () => {
  it("前日の該当タスクが無ければ何もしない", async () => {
    const { client } = makeClient({
      cleaning_tasks: [() => ({ data: [], error: null })],
    });
    const result = await runAutoCarryOver(client as never, "2026-11-04");
    expect(result).toEqual({
      date: "2026-11-04",
      candidates: 0,
      carried: 0,
      skippedNaturalRecur: 0,
      alreadyCarried: 0,
    });
  });

  it("未実施タスクを繰り越し、自然発生分と既繰越分は除外する", async () => {
    const candidateRows = [
      {
        id: "t-carry",
        master_id: "m1",
        master_name: "A",
        photo_requirement: "optional",
        priority: "normal",
        time_slot: "idle",
      },
      {
        id: "t-natural",
        master_id: "m2",
        master_name: "B",
        photo_requirement: "optional",
        priority: "normal",
        time_slot: "idle",
      },
      {
        id: "t-already",
        master_id: "m3",
        master_name: "C",
        photo_requirement: "optional",
        priority: "normal",
        time_slot: "idle",
      },
    ];
    const { client, calls } = makeClient({
      cleaning_tasks: [
        () => ({ data: candidateRows, error: null }), // 前日の候補取得
        () => ({ data: [{ origin_task_id: "t-already" }], error: null }), // 既存繰越チェック
        () => ({ data: { id: "new-1" }, error: null }), // t-carry の insert
      ],
      cleaning_schedules: [
        () => ({ data: [], error: null }), // t-carry: 自然発生しない
        () => ({
          data: [
            {
              active: true,
              frequency: "daily",
              weekdays: [],
              days_of_month: [],
              interval_days: null,
              anchor_date: null,
            },
          ],
          error: null,
        }), // t-natural: 自然発生する
      ],
      cleaning_logs: [() => ({ data: null, error: null })],
    });

    const result = await runAutoCarryOver(client as never, "2026-11-04");
    expect(result).toEqual({
      date: "2026-11-04",
      candidates: 3,
      carried: 1,
      skippedNaturalRecur: 1,
      alreadyCarried: 1,
    });
    // t-already はスケジュール確認にも insert にも進まない（事前チェックで弾かれる）
    expect(calls.filter((c) => c.table === "cleaning_schedules")).toHaveLength(2);
  });
});
