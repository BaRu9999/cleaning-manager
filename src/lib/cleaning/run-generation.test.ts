import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_SLOTS } from "@/config/constants";
import { runGeneration } from "./run-generation";

/**
 * 1回の .from(table) につき1つの結果を返す簡易モック。
 * select/insert/eq/in/gte/lt は素通りのチェーン、.single() および直接の await（.then）で
 * 解決する（supabase-js の PostgrestFilterBuilder が「どこで await されても結果を返す」
 * 挙動を模す。チェーンの呼び出し順序には依存しない）。
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
        in: () => builder,
        gte: () => builder,
        lt: () => builder,
        single: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };
  return { client, calls };
}

const dailyMaster = {
  id: "m1",
  name: "毎日清掃",
  active: true,
  area_id: null,
  category_id: null,
  position: "キッチン",
  default_assignee_id: null,
  photo_requirement: "optional",
  priority: "normal",
  estimated_minutes: 5,
  notes: null,
};
const dailySchedule = {
  id: "s1",
  master_id: "m1",
  active: true,
  time_slot: "closing",
  fixed_time: null,
  due_time: null,
  frequency: "daily",
  weekdays: [],
  days_of_month: [],
  interval_days: null,
  anchor_date: null,
};

const intervalMaster = {
  id: "m2",
  name: "3日ごと清掃",
  active: true,
  area_id: null,
  category_id: null,
  position: "キッチン",
  default_assignee_id: null,
  photo_requirement: "optional",
  priority: "normal",
  estimated_minutes: 10,
  notes: null,
};
const intervalSchedule = {
  id: "s2",
  master_id: "m2",
  active: true,
  time_slot: "closing",
  fixed_time: null,
  due_time: null,
  frequency: "interval",
  weekdays: [],
  days_of_month: [],
  interval_days: 3,
  anchor_date: "2026-09-01",
};

describe("runGeneration", () => {
  it("毎日スケジュールは前倒し対象外。通常どおり pending で生成する", async () => {
    const { client, calls } = makeClient({
      cleaning_master: [() => ({ data: [dailyMaster], error: null })],
      cleaning_schedules: [() => ({ data: [dailySchedule], error: null })],
      cleaning_tasks: [
        () => ({ data: [], error: null }), // 当日の既存auto確認
        () => ({ error: null, count: 1 }), // pending一括insert
      ],
    });

    const result = await runGeneration(client as never, "2026-09-10", DEFAULT_TIME_SLOTS);

    expect(result).toEqual({
      date: "2026-09-10",
      planned: 1,
      inserted: 1,
      alreadyExisted: 0,
      pulledForward: 0,
    });
    // 前倒し判定用の done タスク取得は発生しない（daily は対象外のため）
    expect(calls.filter((c) => c.table === "cleaning_tasks")).toHaveLength(2);
  });

  it("間隔日数スケジュールで、直前発生日より後に完了済みタスクがあれば前倒し消化として自動完了で生成する", async () => {
    // 2026-09-10 は interval_days=3, anchor_date=2026-09-01 の発生日（diff=9）。
    // 直前の発生日は 2026-09-07。2026-09-09 に完了済みタスクがあるため前倒し消化される。
    const { client, calls } = makeClient({
      cleaning_master: [() => ({ data: [intervalMaster], error: null })],
      cleaning_schedules: [() => ({ data: [intervalSchedule], error: null })],
      cleaning_tasks: [
        () => ({ data: [], error: null }), // 当日の既存auto確認
        () => ({
          data: [
            {
              id: "done-1",
              master_id: "m2",
              task_date: "2026-09-09",
              completed_at: "2026-09-09T05:00:00.000Z",
              completed_by: "u9",
            },
          ],
          error: null,
        }), // 前倒し判定用 done タスク取得
        () => ({ data: { id: "new-pf-1" }, error: null }), // 前倒し消化タスクの insert
      ],
      cleaning_logs: [() => ({ data: null, error: null })],
    });

    const result = await runGeneration(client as never, "2026-09-10", DEFAULT_TIME_SLOTS);

    expect(result).toEqual({
      date: "2026-09-10",
      planned: 1,
      inserted: 1,
      alreadyExisted: 0,
      pulledForward: 1,
    });
    expect(calls.filter((c) => c.table === "cleaning_logs")).toHaveLength(1);
    // pending 一括insertは発生しない（全件が前倒し消化のため）
    expect(calls.filter((c) => c.table === "cleaning_tasks")).toHaveLength(3);
  });

  it("間隔日数スケジュールでも、窓内に完了済みタスクが無ければ通常どおり pending で生成する", async () => {
    const { client } = makeClient({
      cleaning_master: [() => ({ data: [intervalMaster], error: null })],
      cleaning_schedules: [() => ({ data: [intervalSchedule], error: null })],
      cleaning_tasks: [
        () => ({ data: [], error: null }), // 当日の既存auto確認
        () => ({ data: [], error: null }), // 前倒し判定用 done タスク取得（該当なし）
        () => ({ error: null, count: 1 }), // pending一括insert
      ],
    });

    const result = await runGeneration(client as never, "2026-09-10", DEFAULT_TIME_SLOTS);

    expect(result).toEqual({
      date: "2026-09-10",
      planned: 1,
      inserted: 1,
      alreadyExisted: 0,
      pulledForward: 0,
    });
  });
});
