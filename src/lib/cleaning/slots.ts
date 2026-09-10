/**
 * 時間帯（time_slot）まわりの純関数。ラベルと時刻は store_settings で可変。
 */

import {
  TIME_SLOT_LABELS,
  TIME_SLOT_ORDER,
  type TimeSlotConfig,
  type TimeSlotKey,
} from "@/config/constants";

/** 表示ラベル（店舗設定を優先、無ければ既定） */
export function slotLabel(
  key: TimeSlotKey,
  slots: TimeSlotConfig[] | undefined,
): string {
  const hit = slots?.find((s) => s.key === key);
  return hit?.label || TIME_SLOT_LABELS[key];
}

/** 並び順インデックス（一覧・通知の見出し順） */
export function slotOrder(key: TimeSlotKey): number {
  const i = TIME_SLOT_ORDER.indexOf(key);
  return i < 0 ? TIME_SLOT_ORDER.length : i;
}

/** 時間帯の終了時刻 'HH:MM'（期限のフォールバックに使う）。無ければ null */
export function slotEndTime(
  key: TimeSlotKey,
  slots: TimeSlotConfig[] | undefined,
): string | null {
  const hit = slots?.find((s) => s.key === key);
  return hit?.end ? hit.end.slice(0, 5) : null;
}

/**
 * スケジュールの「期限時刻 'HH:MM'」を解決する。
 * 明示 due_time > 時間帯の終了時刻 > null（= 自動期限超過しない）
 */
export function resolveDueTime(
  args: { dueTime: string | null; timeSlot: TimeSlotKey },
  slots: TimeSlotConfig[] | undefined,
): string | null {
  if (args.dueTime) return args.dueTime.slice(0, 5);
  return slotEndTime(args.timeSlot, slots);
}

/** 時間帯ごとにグループ化（見出し順） */
export function groupBySlot<T extends { timeSlot: TimeSlotKey }>(
  items: T[],
): { key: TimeSlotKey; items: T[] }[] {
  const map = new Map<TimeSlotKey, T[]>();
  for (const it of items) {
    const arr = map.get(it.timeSlot) ?? [];
    arr.push(it);
    map.set(it.timeSlot, arr);
  }
  return [...map.entries()]
    .sort((a, b) => slotOrder(a[0]) - slotOrder(b[0]))
    .map(([key, items]) => ({ key, items }));
}
