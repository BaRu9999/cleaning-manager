/**
 * 清掃頻度エンジン（純関数・副作用なし）。
 * 「このスケジュールは指定日（JST 暦日）に実施対象か？」を判定する。
 * DB・時刻・乱数に依存しないため Vitest で厳密にテストする。
 */

import type { Frequency } from "@/config/constants";
import {
  addDays,
  dayOfMonth,
  dayOfWeek,
  daysBetween,
  daysInMonth,
} from "@/lib/date/jst";

export interface RecurrenceRule {
  frequency: Frequency;
  /** 0=日 .. 6=土 */
  weekdays: number[];
  /** 1 .. 31 */
  daysOfMonth: number[];
  intervalDays: number | null;
  /** biweekly / interval の基準日 'YYYY-MM-DD' */
  anchorDate: string | null;
}

/** 月末クランプ付きで「その月の N 日」に一致するか（例: 31 指定 → 2月は末日で発火） */
function matchesDayOfMonth(days: number[], date: string): boolean {
  if (days.length === 0) return false;
  const dom = dayOfMonth(date);
  const dim = daysInMonth(date);
  return days.some((d) => Math.min(d, dim) === dom);
}

/** 指定日にこのルールが実施対象か */
export function shouldRunOn(rule: RecurrenceRule, date: string): boolean {
  const dow = dayOfWeek(date);

  switch (rule.frequency) {
    case "daily":
      // weekdays が空なら毎日。指定があればその曜日だけ（例: 毎日清掃だが定休日は除く）
      return rule.weekdays.length === 0 || rule.weekdays.includes(dow);

    case "weekday":
      return rule.weekdays.includes(dow);

    case "weekly":
      return rule.weekdays.length > 0 && rule.weekdays[0] === dow;

    case "biweekly": {
      if (rule.weekdays.length === 0 || rule.weekdays[0] !== dow) return false;
      if (!rule.anchorDate) return true; // anchor 未設定なら毎週扱いにフォールバック
      const weeks = Math.floor(daysBetween(rule.anchorDate, date) / 7);
      return ((weeks % 2) + 2) % 2 === 0;
    }

    case "monthly":
    case "monthly_twice":
    case "day_of_month":
      return matchesDayOfMonth(rule.daysOfMonth, date);

    case "interval": {
      if (!rule.intervalDays || rule.intervalDays < 1 || !rule.anchorDate) {
        return false;
      }
      const diff = daysBetween(rule.anchorDate, date);
      return diff >= 0 && diff % rule.intervalDays === 0;
    }

    case "manual":
      return false;

    default:
      return false;
  }
}

/** from..to（両端含む）でルールが発火する日付一覧 */
export function occurrencesInRange(
  rule: RecurrenceRule,
  from: string,
  to: string,
): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 800) {
    if (shouldRunOn(rule, cur)) out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

/**
 * 複数スケジュールを from..to で展開し、日付 -> 発火した scheduleId 配列 を返す。
 * カレンダーの将来予測に使う（過去・当日は実タスクを優先表示する）。
 */
export function expandSchedules(
  schedules: { id: string; masterId: string; rule: RecurrenceRule }[],
  from: string,
  to: string,
): Map<string, { scheduleId: string; masterId: string }[]> {
  const map = new Map<string, { scheduleId: string; masterId: string }[]>();
  for (const s of schedules) {
    for (const date of occurrencesInRange(s.rule, from, to)) {
      const list = map.get(date) ?? [];
      list.push({ scheduleId: s.id, masterId: s.masterId });
      map.set(date, list);
    }
  }
  return map;
}

/** 人が読める頻度サマリ（"毎週 火" / "毎月 10,25日" など） */
export function describeRule(rule: RecurrenceRule): string {
  const wd = ["日", "月", "火", "水", "木", "金", "土"];
  switch (rule.frequency) {
    case "daily":
      return rule.weekdays.length === 0
        ? "毎日"
        : `毎日（${rule.weekdays.map((d) => wd[d]).join("・")}のみ）`;
    case "weekday":
      return `毎週 ${rule.weekdays.map((d) => wd[d]).join("・")}`;
    case "weekly":
      return `週1回 ${rule.weekdays.map((d) => wd[d]).join("")}曜`;
    case "biweekly":
      return `2週に1回 ${rule.weekdays.map((d) => wd[d]).join("")}曜`;
    case "monthly":
      return `月1回 ${rule.daysOfMonth[0] ?? "?"}日`;
    case "monthly_twice":
      return `月2回 ${rule.daysOfMonth.join("・")}日`;
    case "day_of_month":
      return `毎月 ${rule.daysOfMonth.join("・")}日`;
    case "interval":
      return `${rule.intervalDays ?? "?"}日ごと`;
    case "manual":
      return "手動登録";
    default:
      return "";
  }
}
