/**
 * 「誰に・どの種別の本文を送るか」を決める純関数。
 * 役職ごとの閲覧範囲（visibility）と受信設定（rolePrefs）を適用し、
 * 1利用者につき1通に集約する（担当者本人 かつ リーダーでも二重送信しない）。
 *
 * 通知ロジック:
 *   staff           → 本人の担当清掃のみ
 *   cleaning_leader → 原則すべて
 *   hall_leader     → 原則ホール系（visible_category_ids で変更可）
 *   manager         → すべて ＋ 管理情報（未実施 / 期限超過 / 担当未設定）
 *
 * 出勤ゲート:
 *   staff / cleaning_leader / hall_leader は「その日 daily_staffing に出勤登録が
 *   あるスタッフだけ」に通知する（休みの日には送らない）。manager は常時対象。
 *   その日の出勤データが1件も無い（未設定）場合は制限せず全員へ送る＝後方互換。
 */

import type { CategorySide, JobTitle, LineNotifyType, LineRolePrefs } from "@/config/constants";
import { visibleTasksForUser } from "./visibility";

/**
 * 出勤ゲート。manager は常に true。それ以外は
 * onDutyStaffIds が null（当日の出勤データ未設定）なら true、
 * 設定されていればそのスタッフが含まれているかで判定する。
 */
export function isOnDutyForNotification(
  jobTitle: JobTitle,
  staffId: string,
  onDutyStaffIds: Set<string> | null,
): boolean {
  if (jobTitle === "manager") return true;
  if (onDutyStaffIds == null) return true;
  return onDutyStaffIds.has(staffId);
}

export interface LineTargetUser {
  staffId: string;
  displayName: string;
  jobTitle: JobTitle;
  visibleCategoryIds: string[] | null;
  lineUserId: string;
}

export interface PlanTask {
  id: string;
  masterName: string;
  areaLabel: string | null;
  categoryId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueLabel: string | null;
  slotKey: string;
  slotLabel: string;
  status: "pending" | "in_progress" | "done" | "overdue" | "skipped";
  estimatedMinutes: number | null;
}

const pref = (p: LineRolePrefs, job: JobTitle, type: LineNotifyType) => p[job]?.[type] === true;
const isMissed = (t: PlanTask) => t.status === "overdue" || t.status === "pending";

function scopeOf(user: LineTargetUser, tasks: PlanTask[], sides: Map<string, CategorySide>): PlanTask[] {
  return visibleTasksForUser(
    { id: user.staffId, jobTitle: user.jobTitle, visibleCategoryIds: user.visibleCategoryIds },
    tasks,
    sides,
  );
}

// ---------------------------------------------------------------------------
// morning: staff = 自分の担当のみ（flex） / leader・manager = 全体スケジュール（digest）
// ---------------------------------------------------------------------------
export type MorningKind = "flex_daily" | "digest";
export interface MorningEntry {
  user: LineTargetUser;
  kind: MorningKind;
  tasks: PlanTask[];
}

export function planMorningMessages(
  users: LineTargetUser[],
  tasks: PlanTask[],
  sides: Map<string, CategorySide>,
  rolePrefs: LineRolePrefs,
  onDutyStaffIds: Set<string> | null = null,
): MorningEntry[] {
  const out: MorningEntry[] = [];
  const seen = new Set<string>();

  for (const user of users) {
    if (seen.has(user.lineUserId)) continue;
    if (!pref(rolePrefs, user.jobTitle, "morning")) continue;
    if (!isOnDutyForNotification(user.jobTitle, user.staffId, onDutyStaffIds)) continue;

    if (user.jobTitle === "staff") {
      const mine = tasks.filter((t) => t.assigneeId === user.staffId && t.status !== "skipped");
      if (mine.length === 0) continue; // 担当なしのスタッフには送らない
      out.push({ user, kind: "flex_daily", tasks: mine });
    } else {
      const visible = scopeOf(user, tasks, sides).filter((t) => t.status !== "skipped");
      out.push({ user, kind: "digest", tasks: visible });
    }
    seen.add(user.lineUserId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// progress: 受信 ON の役職へ「予定/完了/未実施/完了率 ＋ 未実施リスト」（スコープ内）
// ---------------------------------------------------------------------------
export interface ProgressEntry {
  user: LineTargetUser;
  planned: number;
  done: number;
  missed: PlanTask[];
}

export function planProgressRecipients(
  users: LineTargetUser[],
  tasks: PlanTask[],
  sides: Map<string, CategorySide>,
  rolePrefs: LineRolePrefs,
  onDutyStaffIds: Set<string> | null = null,
): ProgressEntry[] {
  const out: ProgressEntry[] = [];
  const seen = new Set<string>();
  for (const user of users) {
    if (seen.has(user.lineUserId)) continue;
    if (!pref(rolePrefs, user.jobTitle, "progress")) continue;
    if (!isOnDutyForNotification(user.jobTitle, user.staffId, onDutyStaffIds)) continue;
    const scope =
      user.jobTitle === "staff"
        ? tasks.filter((t) => t.assigneeId === user.staffId)
        : scopeOf(user, tasks, sides);
    const planned = scope.filter((t) => t.status !== "skipped");
    out.push({
      user,
      planned: planned.length,
      done: planned.filter((t) => t.status === "done").length,
      missed: planned.filter(isMissed),
    });
    seen.add(user.lineUserId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// pending / overdue: 対象タスクの担当者 ＋ その種別を受信する役職
// ---------------------------------------------------------------------------
export function planPerTaskRecipients(
  type: Extract<LineNotifyType, "pending" | "overdue">,
  users: LineTargetUser[],
  tasks: PlanTask[],
  sides: Map<string, CategorySide>,
  rolePrefs: LineRolePrefs,
  onDutyStaffIds: Set<string> | null = null,
): { user: LineTargetUser; tasks: PlanTask[] }[] {
  const out: { user: LineTargetUser; tasks: PlanTask[] }[] = [];
  const seen = new Set<string>();

  for (const user of users) {
    if (seen.has(user.lineUserId)) continue;
    if (!pref(rolePrefs, user.jobTitle, type)) continue;
    if (!isOnDutyForNotification(user.jobTitle, user.staffId, onDutyStaffIds)) continue;

    const mine =
      user.jobTitle === "staff"
        ? tasks.filter((t) => t.assigneeId === user.staffId)
        : scopeOf(user, tasks, sides);
    if (mine.length === 0) continue;
    out.push({ user, tasks: mine });
    seen.add(user.lineUserId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// closing: 閉店後レポートを受信する役職
// ---------------------------------------------------------------------------
export function planClosingRecipients(
  users: LineTargetUser[],
  rolePrefs: LineRolePrefs,
  onDutyStaffIds: Set<string> | null = null,
): LineTargetUser[] {
  const seen = new Set<string>();
  const out: LineTargetUser[] = [];
  for (const user of users) {
    if (seen.has(user.lineUserId)) continue;
    if (!pref(rolePrefs, user.jobTitle, "closing")) continue;
    if (!isOnDutyForNotification(user.jobTitle, user.staffId, onDutyStaffIds)) continue;
    out.push(user);
    seen.add(user.lineUserId);
  }
  return out;
}
