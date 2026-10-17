/**
 * 週次・月次レポートの集計本体（純関数）。
 * 既存の清掃漏れ分析（src/lib/cleaning/stats.ts）の指標をそのまま再利用し、
 * 期間・表示用ラベルを付与してレポート用の1つの構造にまとめる。
 */

import { WEEKDAY_LABELS } from "@/config/constants";
import {
  completionByArea,
  implementationByStaff,
  missRanking,
  missedByWeekday,
  overallCompletion,
  type StatTask,
  type Completion,
  type GroupRow,
  type MissRankRow,
} from "@/lib/cleaning/stats";
import type { ReportPeriod } from "./period";

export interface WeekdayRow {
  weekday: number;
  label: string;
  planned: number;
  missed: number;
  missRate: number;
}

export interface CleaningReportData {
  periodType: "week" | "month";
  periodLabel: string;
  storeName: string;
  generatedAtLabel: string;
  overall: Completion;
  /** 完了率が低い順（清掃が行き届いていない場所）。上位10件 */
  worstAreas: GroupRow[];
  /** よく忘れられる清掃項目。上位10件 */
  missRanking: MissRankRow[];
  /** 曜日別の予定・未実施件数（月曜始まり表示用に並び替え済み） */
  weekday: WeekdayRow[];
  /** 完了登録数の多いスタッフ。上位10件 */
  topStaff: { id: string; name: string; done: number }[];
}

const MON_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 月火水木金土日

export function buildCleaningReport(input: {
  tasks: StatTask[];
  period: ReportPeriod;
  periodType: "week" | "month";
  storeName: string;
  generatedAtLabel: string;
}): CleaningReportData {
  const { tasks, period, periodType, storeName, generatedAtLabel } = input;

  const weekdayRaw = missedByWeekday(tasks);
  const weekday: WeekdayRow[] = MON_FIRST_ORDER.map((w) => {
    const r = weekdayRaw[w] ?? { weekday: w, planned: 0, missed: 0 };
    return {
      weekday: w,
      label: WEEKDAY_LABELS[w] ?? "?",
      planned: r.planned,
      missed: r.missed,
      missRate: r.planned > 0 ? Math.round((r.missed / r.planned) * 100) : 0,
    };
  });

  return {
    periodType,
    periodLabel: period.label,
    storeName,
    generatedAtLabel,
    overall: overallCompletion(tasks),
    worstAreas: completionByArea(tasks).slice(0, 10),
    missRanking: missRanking(tasks, { minPlanned: 3 }).slice(0, 10),
    weekday,
    topStaff: implementationByStaff(tasks).slice(0, 10),
  };
}
