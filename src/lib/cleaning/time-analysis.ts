/**
 * 予想時間(estimated_minutes) vs 実績時間(actual_minutes) の分析（純関数）。
 * サンプル数3件未満の項目には強い推奨を出さない（「実績不足」表示にする）。
 */

export const MIN_SAMPLE_FOR_RECOMMENDATION = 3;
/** この割合以上ズレていたら「差が大きい」とみなす */
export const SIGNIFICANT_DIFF_PCT = 20;

export interface TimingRecord {
  masterId: string | null;
  masterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  /** 完了時点の cleaning_master.estimated_minutes（当時値。無ければ null） */
  estimatedMinutes: number | null;
  /** cleaning_tasks.actual_minutes（完了済みのみ対象） */
  actualMinutes: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface RecommendedRange {
  min: number;
  max: number;
}

/** 中央値を含む5分刻みのレンジ（例: 23分 → 20〜25分） */
export function recommendedRange(medianMinutes: number): RecommendedRange {
  const min = Math.floor(medianMinutes / 5) * 5;
  let max = Math.ceil(medianMinutes / 5) * 5;
  if (max <= min) max = min + 5;
  return { min, max };
}

export interface ItemTiming {
  masterId: string | null;
  masterName: string;
  count: number;
  currentEstimate: number | null;
  avgActual: number;
  medianActual: number;
  /** medianActual - currentEstimate（currentEstimate が無ければ null） */
  diffMinutes: number | null;
  diffPct: number | null;
  sufficientSample: boolean;
  /** サンプル十分 かつ 差が SIGNIFICANT_DIFF_PCT% 以上のときのみ */
  recommendedRange: RecommendedRange | null;
}

/** 清掃項目別（masterId 単位）の集計 */
export function analyzeItemTimings(records: TimingRecord[]): ItemTiming[] {
  const groups = new Map<string, TimingRecord[]>();
  for (const r of records) {
    const key = r.masterId ?? `name:${r.masterName}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const out: ItemTiming[] = [];
  for (const rows of groups.values()) {
    const first = rows[0]!;
    const actuals = rows.map((r) => r.actualMinutes);
    const avgActual = round1(actuals.reduce((s, v) => s + v, 0) / actuals.length);
    const med = median(actuals);
    const sufficientSample = rows.length >= MIN_SAMPLE_FOR_RECOMMENDATION;
    // currentEstimate は最新の設定値を使う（同一 masterId 内で null 以外の最後の値）
    const currentEstimate =
      [...rows].reverse().find((r) => r.estimatedMinutes != null)?.estimatedMinutes ?? null;
    const diffMinutes = currentEstimate != null ? round1(med - currentEstimate) : null;
    const diffPct =
      currentEstimate != null && currentEstimate > 0
        ? round1(((med - currentEstimate) / currentEstimate) * 100)
        : null;
    const strongDiff = diffPct != null && Math.abs(diffPct) >= SIGNIFICANT_DIFF_PCT;

    out.push({
      masterId: first.masterId,
      masterName: first.masterName,
      count: rows.length,
      currentEstimate,
      avgActual,
      medianActual: med,
      diffMinutes,
      diffPct,
      sufficientSample,
      recommendedRange: sufficientSample && strongDiff ? recommendedRange(med) : null,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface OverallTiming {
  count: number;
  avgEstimated: number | null;
  avgActual: number;
  diffMinutes: number | null;
  /** 実績が予想を上回った割合（%） */
  overrunRatePct: number;
}

export function analyzeOverallTiming(records: TimingRecord[]): OverallTiming {
  if (records.length === 0) {
    return { count: 0, avgEstimated: null, avgActual: 0, diffMinutes: null, overrunRatePct: 0 };
  }
  const withEstimate = records.filter((r) => r.estimatedMinutes != null);
  const avgEstimated =
    withEstimate.length > 0
      ? round1(withEstimate.reduce((s, r) => s + (r.estimatedMinutes ?? 0), 0) / withEstimate.length)
      : null;
  const avgActual = round1(records.reduce((s, r) => s + r.actualMinutes, 0) / records.length);
  const overCount = withEstimate.filter((r) => r.actualMinutes > (r.estimatedMinutes ?? 0)).length;
  const overrunRatePct =
    withEstimate.length > 0 ? Math.round((overCount / withEstimate.length) * 100) : 0;
  return {
    count: records.length,
    avgEstimated,
    avgActual,
    diffMinutes: avgEstimated != null ? round1(avgActual - avgEstimated) : null,
    overrunRatePct,
  };
}

export interface StaffTiming {
  staffId: string;
  staffName: string;
  count: number;
  avgActual: number;
}

export function analyzeStaffTiming(records: TimingRecord[]): StaffTiming[] {
  const groups = new Map<string, TimingRecord[]>();
  for (const r of records) {
    if (!r.assigneeId) continue;
    const arr = groups.get(r.assigneeId) ?? [];
    arr.push(r);
    groups.set(r.assigneeId, arr);
  }
  const out: StaffTiming[] = [];
  for (const [staffId, rows] of groups) {
    out.push({
      staffId,
      staffName: rows[0]!.assigneeName ?? "(不明)",
      count: rows.length,
      avgActual: round1(rows.reduce((s, r) => s + r.actualMinutes, 0) / rows.length),
    });
  }
  return out.sort((a, b) => b.avgActual - a.avgActual);
}

/** 時間超過ランキング（サンプル十分な項目のみ、乖離率の大きい順） */
export function overrunRanking(items: ItemTiming[], limit = 10): ItemTiming[] {
  return items
    .filter((i) => i.sufficientSample && i.diffPct != null && i.diffPct > 0)
    .sort((a, b) => (b.diffPct ?? 0) - (a.diffPct ?? 0))
    .slice(0, limit);
}
