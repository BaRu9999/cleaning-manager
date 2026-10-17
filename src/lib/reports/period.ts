/**
 * 週次・月次レポートの対象期間計算（純関数）。
 * 週は月曜始まり（JST暦日）。
 */

import { addDays, dayOfWeek, endOfMonth, formatLongJp, formatMonthJp, startOfMonth } from "@/lib/date/jst";

export interface ReportPeriod {
  from: string;
  to: string;
  label: string;
}

/** base を含む月曜始まりの週（月〜日） */
export function getWeekRange(base: string): ReportPeriod {
  const offset = (dayOfWeek(base) + 6) % 7; // 月曜=0 ... 日曜=6
  const from = addDays(base, -offset);
  const to = addDays(from, 6);
  return { from, to, label: `${formatLongJp(from)} 〜 ${formatLongJp(to)}` };
}

/** base を含む月（1日〜末日） */
export function getMonthRange(base: string): ReportPeriod {
  const from = startOfMonth(base);
  const to = endOfMonth(from);
  return { from, to, label: formatMonthJp(from) };
}
