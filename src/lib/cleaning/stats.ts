/**
 * ダッシュボード・清掃漏れ分析の集計（純関数・副作用なし）。
 * DB から取得したタスク配列を渡すだけで各指標を返す。Vitest でテストする。
 *
 * 「未実施(missed)」の定義: status が overdue、または（過去日で）pending のまま。
 * skipped は意図的な対応なので未実施には数えない。
 */

import { dayOfWeek } from "@/lib/date/jst";
import type { TaskStatus } from "@/config/constants";

export interface StatTask {
  taskDate: string;
  status: TaskStatus;
  masterId: string | null;
  masterName: string;
  areaLabel: string | null;
  categoryLabel: string | null;
  completedById: string | null;
  completedByName: string | null;
}

const isPlanned = (s: TaskStatus) => s !== "skipped";
const isDone = (s: TaskStatus) => s === "done";
const isMissed = (s: TaskStatus) => s === "overdue" || s === "pending";

function rate(done: number, planned: number): number {
  return planned > 0 ? Math.round((done / planned) * 100) : 0;
}

export interface Completion {
  planned: number;
  done: number;
  missed: number;
  rate: number;
}

/** 全体の完了率 */
export function overallCompletion(tasks: StatTask[]): Completion {
  let planned = 0;
  let done = 0;
  let missed = 0;
  for (const t of tasks) {
    if (!isPlanned(t.status)) continue;
    planned += 1;
    if (isDone(t.status)) done += 1;
    if (isMissed(t.status)) missed += 1;
  }
  return { planned, done, missed, rate: rate(done, planned) };
}

export interface GroupRow extends Completion {
  key: string;
  label: string;
}

function groupBy(
  tasks: StatTask[],
  keyOf: (t: StatTask) => { key: string; label: string } | null,
): GroupRow[] {
  const acc = new Map<string, GroupRow>();
  for (const t of tasks) {
    if (!isPlanned(t.status)) continue;
    const g = keyOf(t);
    if (!g) continue;
    const row =
      acc.get(g.key) ??
      ({ key: g.key, label: g.label, planned: 0, done: 0, missed: 0, rate: 0 } as GroupRow);
    row.planned += 1;
    if (isDone(t.status)) row.done += 1;
    if (isMissed(t.status)) row.missed += 1;
    acc.set(g.key, row);
  }
  const rows = [...acc.values()];
  for (const r of rows) r.rate = rate(r.done, r.planned);
  return rows;
}

/** 清掃場所別の完了率（完了率の低い順 = 危ない順） */
export function completionByArea(tasks: StatTask[]): GroupRow[] {
  return groupBy(tasks, (t) => {
    const label = t.areaLabel || t.categoryLabel || "未分類";
    return { key: label, label };
  }).sort((a, b) => a.rate - b.rate || b.planned - a.planned);
}

/** カテゴリー別の完了率 */
export function completionByCategory(tasks: StatTask[]): GroupRow[] {
  return groupBy(tasks, (t) => {
    const label = t.categoryLabel || "未分類";
    return { key: label, label };
  }).sort((a, b) => a.rate - b.rate);
}

/** スタッフ別の実施数（完了登録した人でカウント、多い順） */
export function implementationByStaff(
  tasks: StatTask[],
): { id: string; name: string; done: number }[] {
  const acc = new Map<string, { id: string; name: string; done: number }>();
  for (const t of tasks) {
    if (!isDone(t.status) || !t.completedById) continue;
    const row = acc.get(t.completedById) ?? {
      id: t.completedById,
      name: t.completedByName || "(不明)",
      done: 0,
    };
    row.done += 1;
    acc.set(t.completedById, row);
  }
  return [...acc.values()].sort((a, b) => b.done - a.done);
}

/** 曜日別の未実施件数（0=日 .. 6=土） */
export function missedByWeekday(
  tasks: StatTask[],
): { weekday: number; planned: number; missed: number }[] {
  const rows = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    planned: 0,
    missed: 0,
  }));
  for (const t of tasks) {
    if (!isPlanned(t.status)) continue;
    const w = dayOfWeek(t.taskDate);
    const row = rows[w];
    if (!row) continue;
    row.planned += 1;
    if (isMissed(t.status)) row.missed += 1;
  }
  return rows;
}

export interface MissRankRow {
  masterId: string | null;
  masterName: string;
  planned: number;
  missed: number;
  missRate: number;
}

/**
 * 「よく忘れられている清掃」ランキング。
 * @param minPlanned 母数がこの数未満の項目は除外（ノイズ抑制）
 */
export function missRanking(
  tasks: StatTask[],
  opts: { minPlanned?: number } = {},
): MissRankRow[] {
  const minPlanned = opts.minPlanned ?? 3;
  const acc = new Map<string, MissRankRow>();
  for (const t of tasks) {
    if (!isPlanned(t.status)) continue;
    const key = t.masterId ?? `name:${t.masterName}`;
    const row =
      acc.get(key) ??
      ({
        masterId: t.masterId,
        masterName: t.masterName,
        planned: 0,
        missed: 0,
        missRate: 0,
      } as MissRankRow);
    row.planned += 1;
    if (isMissed(t.status)) row.missed += 1;
    acc.set(key, row);
  }
  return [...acc.values()]
    .filter((r) => r.planned >= minPlanned && r.missed > 0)
    .map((r) => ({ ...r, missRate: Math.round((r.missed / r.planned) * 100) }))
    .sort((a, b) => b.missRate - a.missRate || b.missed - a.missed);
}
