/**
 * LINE Flex Message ビルダー（純関数）。
 * スマホで一目で分かるバブル。テキスト版のフォールバックは messages.ts。
 */

import type { TaskStatus } from "@/config/constants";
import { TASK_STATUS_LABELS } from "@/config/constants";

export interface FlexTask {
  name: string;
  areaLabel: string | null;
  dueLabel: string | null; // "15:00" / "閉店後" 等
  status: TaskStatus;
}

type Box = Record<string, unknown>;

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "#64748B",
  in_progress: "#0284C7",
  done: "#059669",
  overdue: "#DC2626",
  skipped: "#94A3B8",
};

function taskRow(t: FlexTask): Box {
  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "xs",
    contents: [
      {
        type: "box",
        layout: "baseline",
        contents: [
          {
            type: "text",
            text: t.dueLabel ? `${t.dueLabel}まで` : "時間指定なし",
            size: "sm",
            color: "#475569",
            flex: 0,
          },
          {
            type: "text",
            text: TASK_STATUS_LABELS[t.status],
            size: "sm",
            align: "end",
            color: STATUS_COLOR[t.status],
            weight: "bold",
          },
        ],
      },
      {
        type: "text",
        text: t.name,
        size: "md",
        weight: "bold",
        wrap: true,
        color: "#0F172A",
      },
      ...(t.areaLabel
        ? [{ type: "text", text: t.areaLabel, size: "xs", color: "#94A3B8" }]
        : []),
    ],
  };
}

function linkButton(label: string, url: string): Box {
  return {
    type: "button",
    style: "primary",
    color: "#0F172A",
    height: "sm",
    action: { type: "uri", label, uri: url },
  };
}

function bubble(opts: {
  headerText: string;
  headerSub: string;
  bigNumber?: string;
  tasks: FlexTask[];
  footerLabel: string;
  footerUrl: string;
  accent?: string;
}): Box {
  const accent = opts.accent ?? "#0F172A";
  const rows: Box[] = [];
  opts.tasks.forEach((t, i) => {
    if (i > 0) rows.push({ type: "separator", margin: "md" });
    rows.push(taskRow(t));
  });
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: accent,
      paddingAll: "16px",
      contents: [
        { type: "text", text: opts.headerText, color: "#FFFFFF", weight: "bold", size: "lg" },
        { type: "text", text: opts.headerSub, color: "#E2E8F0", size: "sm", margin: "xs" },
        ...(opts.bigNumber
          ? [{ type: "text", text: opts.bigNumber, color: "#FFFFFF", weight: "bold", size: "xxl", margin: "sm" }]
          : []),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: rows.length > 0 ? rows : [{ type: "text", text: "対象の清掃はありません", size: "sm", color: "#94A3B8" }],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [linkButton(opts.footerLabel, opts.footerUrl)],
    },
  };
}

export interface FlexMessage {
  type: "flex";
  altText: string;
  contents: Box;
}

/** 本日の担当（個別 Push） */
export function buildDailyCleaningFlex(input: {
  date: string; // "YYYY-MM-DD"
  count: number;
  /** 担当タスクの推定所要時間の合計（分）。分かる場合のみ表示に追加。 */
  totalMinutes?: number;
  tasks: FlexTask[];
  liffTodayUrl: string;
}): FlexMessage {
  const md = `${Number(input.date.slice(5, 7))}月${Number(input.date.slice(8, 10))}日`;
  const bigNumber =
    input.totalMinutes != null ? `${input.count}件 ／ 予定${input.totalMinutes}分` : `${input.count}件`;
  return {
    type: "flex",
    altText: `本日の清掃 ${input.count}件`,
    contents: bubble({
      headerText: "本日の清掃",
      headerSub: md,
      bigNumber,
      tasks: input.tasks,
      footerLabel: "今日の清掃を見る",
      footerUrl: input.liffTodayUrl,
    }),
  };
}

/** 期限前リマインド */
export function buildReminderFlex(input: {
  tasks: FlexTask[];
  liffTodayUrl: string;
}): FlexMessage {
  return {
    type: "flex",
    altText: "清掃リマインド",
    contents: bubble({
      headerText: "清掃リマインド",
      headerSub: "まだ完了していない清掃があります",
      tasks: input.tasks,
      footerLabel: "清掃を確認",
      footerUrl: input.liffTodayUrl,
      accent: "#B45309",
    }),
  };
}

/** 期限超過 */
export function buildOverdueFlex(input: {
  tasks: FlexTask[];
  liffTodayUrl: string;
}): FlexMessage {
  return {
    type: "flex",
    altText: "清掃時間を過ぎています",
    contents: bubble({
      headerText: "清掃時間を過ぎています",
      headerSub: "まだ完了していません",
      tasks: input.tasks,
      footerLabel: "確認する",
      footerUrl: input.liffTodayUrl,
      accent: "#DC2626",
    }),
  };
}
