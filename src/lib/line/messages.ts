/**
 * LINE 通知のテキスト本文（純関数）。
 * morning(staff) / pending / overdue は Flex（flex.ts）が主で、これはフォールバック。
 * morning(leader) の全体スケジュール、progress、closing はテキスト。
 */

import { TASK_STATUS_LABELS } from "@/config/constants";
import type { PlanTask } from "./recipients";

function groupBySlot(tasks: PlanTask[]): { label: string; items: PlanTask[] }[] {
  const order: string[] = [];
  const map = new Map<string, { label: string; items: PlanTask[] }>();
  for (const t of tasks) {
    if (!map.has(t.slotKey)) {
      map.set(t.slotKey, { label: t.slotLabel, items: [] });
      order.push(t.slotKey);
    }
    map.get(t.slotKey)!.items.push(t);
  }
  return order.map((k) => map.get(k)!);
}

const assignee = (n: string | null) => (n ? `担当：${n}` : "担当：未設定");
const dateJp = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
const isMissed = (t: PlanTask) => t.status === "overdue" || t.status === "pending";

// ---------------------------------------------------------------------------
// morning: 一般スタッフ（Flex フォールバック）
// ---------------------------------------------------------------------------
export function buildStaffDailyText(input: {
  displayName: string;
  date: string;
  tasks: PlanTask[];
  liffUrl: string;
}): string {
  const totalMinutes = input.tasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
  const lines = [
    "【本日の清掃】",
    "",
    `本日の担当は${input.tasks.length}件です。予定 ${totalMinutes}分`,
  ];
  for (const g of groupBySlot(input.tasks)) {
    lines.push("", g.label);
    for (const t of g.items) {
      lines.push(t.dueLabel ? `${t.dueLabel}まで` : "時間指定なし");
      lines.push(t.masterName);
    }
  }
  lines.push("", "今日もよろしくお願いします。", `▶ ${input.liffUrl}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// morning: 清掃リーダー / ホールリーダー / 店長（誰が・何時までに・どこを・状態）
// ---------------------------------------------------------------------------
export function buildScheduleDigestText(input: {
  date: string;
  tasks: PlanTask[];
  /** 未実施 / 期限超過 / 担当未設定 の管理サマリを付けるか */
  withManagementSummary: boolean;
  appUrl: string;
}): string {
  const lines = [
    "【本日の清掃スケジュール】",
    "",
    `本日の予定`,
    `${input.tasks.length}件`,
  ];
  for (const g of groupBySlot(input.tasks)) {
    lines.push("", `■ ${g.label}`);
    for (const t of g.items) {
      lines.push("");
      lines.push(t.masterName);
      lines.push(assignee(t.assigneeName));
      if (t.dueLabel) lines.push(`期限：${t.dueLabel}`);
      if (t.status !== "pending") lines.push(`状態：${TASK_STATUS_LABELS[t.status]}`);
    }
  }
  if (input.withManagementSummary) {
    const missed = input.tasks.filter(isMissed);
    const unassigned = input.tasks.filter((t) => !t.assigneeName);
    lines.push("", "―――");
    lines.push(`未実施・期限超過：${missed.length}件`);
    lines.push(`担当未設定：${unassigned.length}件`);
    if (unassigned.length > 0) {
      lines.push("", "■ 担当未設定");
      for (const t of unassigned) lines.push(`・${t.masterName}（${t.slotLabel}）`);
    }
  }
  lines.push("", "[本日の清掃状況を見る]", `▶ ${input.appUrl}/today`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// progress: 途中進捗（管理者・リーダー向け）
// ---------------------------------------------------------------------------
export function buildProgressText(input: {
  nowLabel: string; // "17:00"
  planned: number;
  done: number;
  missedTasks: PlanTask[];
  appUrl: string;
}): string {
  const { nowLabel, planned, done, missedTasks } = input;
  const rate = planned > 0 ? Math.round((done / planned) * 100) : 0;
  const lines = [
    "【清掃進捗】",
    "",
    `${nowLabel}現在`,
    "",
    "予定",
    `${planned}件`,
    "完了",
    `${done}件`,
    "未実施",
    `${planned - done}件`,
    "完了率",
    `${rate}%`,
  ];
  if (missedTasks.length > 0) {
    lines.push("", "■ 未実施");
    for (const t of missedTasks) {
      lines.push("");
      lines.push(t.masterName);
      lines.push(assignee(t.assigneeName));
      if (t.dueLabel) lines.push(`期限：${t.dueLabel}`);
    }
  }
  lines.push("", "[進捗を確認]", `▶ ${input.appUrl}/admin`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// pending / overdue: 担当者本人向け（Flex フォールバック）
// ---------------------------------------------------------------------------
export function buildReminderText(input: { tasks: PlanTask[]; liffUrl: string }): string {
  const lines = ["【清掃リマインド】", "", "まだ完了していない清掃があります。"];
  for (const t of input.tasks) {
    lines.push("", t.masterName, `期限`, `${t.dueLabel ?? "未設定"}`);
  }
  lines.push("", "[清掃を確認]", `▶ ${input.liffUrl}`);
  return lines.join("\n");
}

export function buildOverdueText(input: { tasks: PlanTask[]; liffUrl: string }): string {
  if (input.tasks.length === 1) {
    const t = input.tasks[0]!;
    return [
      "【清掃時間を過ぎています】",
      "",
      `${t.masterName}清掃がまだ完了していません。`,
      "",
      "期限",
      `${t.dueLabel ?? "未設定"}`,
      "",
      "[確認する]",
      `▶ ${input.liffUrl}`,
    ].join("\n");
  }
  const lines = ["【清掃時間を過ぎています】", "", `${input.tasks.length}件が未完了です。`];
  for (const t of input.tasks) lines.push("", t.masterName, `期限：${t.dueLabel ?? "未設定"}`);
  lines.push("", "[確認する]", `▶ ${input.liffUrl}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// pending / overdue: リーダー・店長向け（スコープ内の未実施をまとめて）
// ---------------------------------------------------------------------------
export function buildMissedDigestText(input: {
  heading: string; // "未実施の清掃" / "期限超過の清掃"
  tasks: PlanTask[];
  appUrl: string;
}): string {
  const lines = [`【${input.heading}】`, "", `${input.tasks.length}件`];
  for (const g of groupBySlot(input.tasks)) {
    lines.push("", `■ ${g.label}`);
    for (const t of g.items) {
      lines.push("");
      lines.push(t.masterName);
      lines.push(assignee(t.assigneeName));
      if (t.dueLabel) lines.push(`期限：${t.dueLabel}`);
    }
  }
  lines.push("", `▶ ${input.appUrl}/today`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// closing: 閉店後レポート（店舗全体）
// ---------------------------------------------------------------------------
export function buildClosingReportText(input: {
  date: string;
  planned: number;
  done: number;
  missed: PlanTask[];
  appUrl: string;
}): string {
  const rate = input.planned > 0 ? Math.round((input.done / input.planned) * 100) : 0;
  const lines = [
    "【本日の清掃結果】",
    `（${dateJp(input.date)}）`,
    "",
    "予定",
    `${input.planned}件`,
    "完了",
    `${input.done}件`,
    "未実施",
    `${input.planned - input.done}件`,
    "完了率",
    `${rate}%`,
  ];
  if (input.missed.length > 0) {
    lines.push("", "未実施");
    for (const t of input.missed) {
      lines.push("");
      lines.push(`・${t.masterName}`);
      lines.push(`　${assignee(t.assigneeName)}`);
    }
  }
  lines.push("", "[管理画面を確認]", `▶ ${input.appUrl}/admin`);
  return lines.join("\n");
}
