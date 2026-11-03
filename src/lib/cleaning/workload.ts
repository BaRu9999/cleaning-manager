/**
 * 清掃負荷ランク（純関数）。
 * estimated_minutes から自動導出する。DB に手入力ランクは持たない。
 *
 *   S:  1〜5分   → 1pt
 *   M:  6〜10分  → 2pt
 *   L:  11〜20分 → 3pt
 *   XL: 21分〜   → 5pt
 *   null / 0以下 → 未設定（rank=null, points=0）
 */

export type WorkloadRank = "S" | "M" | "L" | "XL";

export interface WorkloadInfo {
  rank: WorkloadRank | null;
  points: number;
}

export const WORKLOAD_RANK_LABELS: Record<WorkloadRank, string> = {
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
};

export function getWorkloadRank(minutes: number | null | undefined): WorkloadInfo {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return { rank: null, points: 0 };
  }
  if (minutes <= 5) return { rank: "S", points: 1 };
  if (minutes <= 10) return { rank: "M", points: 2 };
  if (minutes <= 20) return { rank: "L", points: 3 };
  return { rank: "XL", points: 5 };
}

/** 「約20分 / L」のような短い表示文字列 */
export function formatWorkload(minutes: number | null | undefined): string {
  const { rank } = getWorkloadRank(minutes);
  if (minutes == null || rank == null) return "未設定";
  return `約${minutes}分 / ${rank}`;
}

// ---------------------------------------------------------------------------
// 担当者別負荷（当日のタスク配列から集計）
// ---------------------------------------------------------------------------
export interface WorkloadTask {
  assigneeId: string | null;
  assigneeName: string | null;
  estimatedMinutes: number | null;
  status: string;
}

export interface StaffWorkload {
  staffId: string;
  staffName: string;
  count: number;
  totalMinutes: number;
  totalPoints: number;
}

/**
 * 担当者ごとの件数・合計推定時間・合計負荷ポイントを集計する。
 * スキップ済みは母数から除外（対応が不要になったため）。
 */
export function computeStaffWorkload(tasks: WorkloadTask[]): StaffWorkload[] {
  const map = new Map<string, StaffWorkload>();
  for (const t of tasks) {
    if (!t.assigneeId || t.status === "skipped") continue;
    const row = map.get(t.assigneeId) ?? {
      staffId: t.assigneeId,
      staffName: t.assigneeName ?? "(不明)",
      count: 0,
      totalMinutes: 0,
      totalPoints: 0,
    };
    row.count += 1;
    row.totalMinutes += t.estimatedMinutes ?? 0;
    row.totalPoints += getWorkloadRank(t.estimatedMinutes).points;
    map.set(t.assigneeId, row);
  }
  return [...map.values()].sort((a, b) => b.totalMinutes - a.totalMinutes);
}
