/**
 * Slack メッセージ本文の生成（純関数）。
 * text は仕様どおりのプレーン文面、blocks は Slack Block Kit で見やすく整形。
 * Slack の上限（section text 3000字 / blocks 50個 / header 150字）を守る。
 */

import { formatLongJp, formatTimeJst } from "@/lib/date/jst";
import type { SlackMessage } from "./notify";

const SECTION_LIMIT = 2900;

function section(text: string): Record<string, unknown> {
  return {
    type: "section",
    text: { type: "mrkdwn", text: text.slice(0, SECTION_LIMIT) },
  };
}
function header(text: string): Record<string, unknown> {
  return { type: "header", text: { type: "plain_text", text: text.slice(0, 148), emoji: true } };
}

export interface DailyPlanSlot {
  label: string;
  names: string[];
}

/** 当日清掃通知 */
export function buildDailyPlanMessage(input: {
  date: string;
  total: number;
  slots: DailyPlanSlot[];
  appUrl?: string | null;
}): SlackMessage {
  const { date, total, slots } = input;
  const lines: string[] = ["【本日の清掃予定】", "", `本日の清掃予定は${total}件です。`];
  for (const s of slots) {
    if (s.names.length === 0) continue;
    lines.push("", s.label);
    for (const n of s.names) lines.push(`・${n}`);
  }
  const text = lines.join("\n");

  const blocks: Record<string, unknown>[] = [
    header(`🧹 本日の清掃予定（${formatLongJp(date)}）`),
    section(`本日の清掃予定は *${total}件* です。`),
  ];
  for (const s of slots) {
    if (s.names.length === 0) continue;
    blocks.push(section(`*${s.label}*\n${s.names.map((n) => `• ${n}`).join("\n")}`));
  }
  if (input.appUrl) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `<${input.appUrl}/today|アプリで今日の清掃を開く>` }],
    });
  }
  return { text, blocks };
}

/** 未実施（期限超過）通知 */
export function buildOverdueMessage(input: {
  masterName: string;
  dueAt: string | null;
  fixedTime: string | null;
  position: string | null;
  assigneeName: string | null;
}): SlackMessage {
  const timeLabel =
    input.fixedTime?.slice(0, 5) || formatTimeJst(input.dueAt) || "未設定";
  const who = input.assigneeName || input.position || "指定なし";
  const text = [
    "【清掃未実施】",
    "",
    `${input.masterName}が未実施です。`,
    "",
    "予定時刻:",
    timeLabel,
    "",
    "担当:",
    who,
  ].join("\n");

  return {
    text,
    blocks: [
      header("⚠️ 清掃未実施"),
      section(
        `*${input.masterName}* が予定時刻を過ぎても完了していません。\n` +
          `• 予定時刻: *${timeLabel}*\n• 担当: *${who}*`,
      ),
    ],
  };
}

/** 複数件をまとめた未実施通知（check-overdue が新規超過をまとめて送る場合） */
export function buildOverdueDigestMessage(input: {
  items: { masterName: string; timeLabel: string; who: string }[];
}): SlackMessage {
  const { items } = input;
  const text = [
    "【清掃未実施】",
    "",
    `${items.length}件の清掃が予定時刻を過ぎています。`,
    "",
    ...items.map((i) => `・${i.masterName}（${i.timeLabel} / ${i.who}）`),
  ].join("\n");
  return {
    text,
    blocks: [
      header("⚠️ 清掃未実施"),
      section(
        `*${items.length}件* の清掃が予定時刻を過ぎています。\n` +
          items.map((i) => `• *${i.masterName}*（${i.timeLabel} / ${i.who}）`).join("\n"),
      ),
    ],
  };
}

/** 閉店時通知 */
export function buildClosingSummaryMessage(input: {
  date: string;
  planned: number;
  done: number;
  missed: number;
  missedNames: string[];
  appUrl?: string | null;
}): SlackMessage {
  const rate = input.planned > 0 ? Math.round((input.done / input.planned) * 100) : 0;
  const lines = [
    "【本日の清掃結果】",
    "",
    "予定:",
    `${input.planned}件`,
    "完了:",
    `${input.done}件`,
    "未実施:",
    `${input.missed}件`,
    "完了率:",
    `${rate}%`,
  ];
  if (input.missedNames.length > 0) {
    lines.push("", "未実施:");
    for (const n of input.missedNames) lines.push(`・${n}`);
  }
  const text = lines.join("\n");

  const emoji = rate >= 100 ? "✅" : rate >= 80 ? "🟡" : "🔴";
  const blocks: Record<string, unknown>[] = [
    header(`${emoji} 本日の清掃結果（${formatLongJp(input.date)}）`),
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*予定*\n${input.planned}件` },
        { type: "mrkdwn", text: `*完了*\n${input.done}件` },
        { type: "mrkdwn", text: `*未実施*\n${input.missed}件` },
        { type: "mrkdwn", text: `*完了率*\n${rate}%` },
      ],
    },
  ];
  if (input.missedNames.length > 0) {
    blocks.push(section(`*未実施*\n${input.missedNames.map((n) => `• ${n}`).join("\n")}`));
  }
  if (input.appUrl) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `<${input.appUrl}/admin|管理ダッシュボードを開く>` }],
    });
  }
  return { text, blocks };
}
