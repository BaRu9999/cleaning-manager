/**
 * Cron から呼ぶ LINE 配信オーケストレーション。
 * service_role クライアントで当日タスク・カテゴリー・LINE 連携スタッフを読み、
 * 役職・担当に応じて Flex / テキストを生成し、notification_logs で重複を防いで push する。
 *
 * 純ロジック: recipients.ts（誰に何を） / messages.ts（テキスト） / flex.ts（Flex）
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategorySide, LineNotifyType } from "@/config/constants";
import { getSiteUrl, getTodayLink, resolveLineConfig } from "@/lib/env";
import { formatTimeJst, trimSeconds } from "@/lib/date/jst";
import { slotLabel } from "@/lib/cleaning/slots";
import type { CleaningTask, NotificationSettings, StoreSettings } from "@/lib/types/domain";
import {
  planClosingRecipients,
  planMorningMessages,
  planPerTaskRecipients,
  planProgressRecipients,
  type LineTargetUser,
  type PlanTask,
} from "./recipients";
import {
  buildClosingReportText,
  buildMissedDigestText,
  buildProgressText,
  buildScheduleDigestText,
} from "./messages";
import {
  buildDailyCleaningFlex,
  buildOverdueFlex,
  buildReminderFlex,
  type FlexTask,
} from "./flex";
import { pushLineMessages, type LineMessage, LinePushError } from "./push";
import { claimNotification, markNotificationResult } from "./notify-log";

// ---------------------------------------------------------------------------

const liffTodayUrl = () => getTodayLink();

function getSender(settings: NotificationSettings): string | null {
  return (
    resolveLineConfig({
      accessToken: settings.lineChannelAccessToken,
      channelSecret: settings.lineChannelSecret,
    })?.accessToken ?? null
  );
}

async function loadTargets(admin: SupabaseClient): Promise<LineTargetUser[]> {
  const { data } = await admin
    .from("staff_line_accounts")
    .select("line_user_id, staff:users!staff_id(id, display_name, job_title, visible_category_ids, active)")
    .eq("is_active", true);
  const out: LineTargetUser[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const s0 = r.staff as Record<string, unknown> | Record<string, unknown>[] | null;
    const s = Array.isArray(s0) ? s0[0] : s0;
    if (!s || s.active === false) continue;
    out.push({
      staffId: String(s.id),
      displayName: String(s.display_name ?? ""),
      jobTitle: (s.job_title as LineTargetUser["jobTitle"]) ?? "staff",
      visibleCategoryIds: Array.isArray(s.visible_category_ids)
        ? (s.visible_category_ids as string[])
        : null,
      lineUserId: String(r.line_user_id),
    });
  }
  return out;
}

async function loadSides(admin: SupabaseClient): Promise<Map<string, CategorySide>> {
  const { data } = await admin.from("cleaning_categories").select("id, side");
  return new Map(
    ((data ?? []) as Record<string, unknown>[]).map((r) => [
      String(r.id),
      (r.side as CategorySide) ?? "other",
    ]),
  );
}

/**
 * 出勤ゲート用の対象日 daily_staffing。1件も無い日（未設定）は null を返し、
 * 呼び出し側（recipients.ts の各 plan 関数）で「制限なし＝全員へ送る」にフォールバックする。
 */
async function loadOnDutyStaffIds(admin: SupabaseClient, date: string): Promise<Set<string> | null> {
  const { data } = await admin.from("daily_staffing").select("user_id").eq("work_date", date);
  if (!data || data.length === 0) return null;
  return new Set(data.map((r) => String((r as { user_id: string }).user_id)));
}

/** CleaningTask → PlanTask（ラベル解決済み） */
export function toPlanTasks(tasks: CleaningTask[], store: StoreSettings): PlanTask[] {
  return tasks.map((t) => ({
    id: t.id,
    masterName: t.masterName,
    areaLabel: t.areaLabel,
    categoryId: t.categoryId,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeName,
    dueLabel: t.fixedTime ? trimSeconds(t.fixedTime) : formatTimeJst(t.dueAt),
    slotKey: t.timeSlot,
    slotLabel: slotLabel(t.timeSlot, store.timeSlots),
    status: t.status,
    estimatedMinutes: t.estimatedMinutes,
  }));
}

function toFlexTasks(tasks: PlanTask[]): FlexTask[] {
  return tasks.map((t) => ({
    name: t.masterName,
    areaLabel: t.areaLabel,
    dueLabel: t.dueLabel,
    status: t.status,
  }));
}

interface SendJob {
  userId: string;
  messages: LineMessage[];
  dedupeKey: string;
  meta: { notificationType: string; cleaningTaskId?: string | null; staffId?: string | null };
}

export interface DispatchSummary {
  skipped?: string;
  targeted: number;
  sent: number;
  skippedDup: number;
  failed: number;
}

async function runJobs(
  admin: SupabaseClient,
  accessToken: string,
  jobs: SendJob[],
  dry: boolean,
): Promise<DispatchSummary> {
  let sent = 0;
  let skippedDup = 0;
  let failed = 0;

  for (const job of jobs) {
    if (dry) continue;
    const { claimed, logId } = await claimNotification(admin, job.dedupeKey, {
      notificationType: job.meta.notificationType,
      cleaningTaskId: job.meta.cleaningTaskId ?? null,
      staffId: job.meta.staffId ?? null,
      lineUserId: job.userId,
    });
    if (!claimed) {
      skippedDup += 1;
      continue;
    }
    try {
      const { requestId } = await pushLineMessages(accessToken, job.userId, job.messages);
      await markNotificationResult(admin, logId, { status: "sent", lineRequestId: requestId });
      sent += 1;
    } catch (e) {
      failed += 1;
      const status = e instanceof LinePushError ? e.status : 0;
      const retryable = !(status >= 400 && status < 500 && status !== 429);
      await markNotificationResult(admin, logId, {
        status: "failed",
        errorMessage: e instanceof LinePushError ? `${e.status}:${e.body.slice(0, 200)}` : String(e),
        retryable,
      });
    }
  }
  return { targeted: jobs.length, sent, skippedDup, failed };
}

async function baseCtx(admin: SupabaseClient) {
  const [users, sides] = await Promise.all([loadTargets(admin), loadSides(admin)]);
  return { users, sides };
}

// ---------------------------------------------------------------------------
// morning: 担当者へ個別 Flex ＋ リーダー / 店長へ全体スケジュール
// ---------------------------------------------------------------------------
export async function dispatchMorning(args: {
  admin: SupabaseClient;
  settings: NotificationSettings;
  store: StoreSettings;
  tasks: CleaningTask[];
  date: string;
  dry?: boolean;
}): Promise<DispatchSummary> {
  const { admin, settings, store, tasks, date, dry } = args;
  if (!settings.lineEnabled) return { skipped: "line_disabled", targeted: 0, sent: 0, skippedDup: 0, failed: 0 };
  const token = getSender(settings);
  if (!token) return { skipped: "no_token", targeted: 0, sent: 0, skippedDup: 0, failed: 0 };

  const { users, sides } = await baseCtx(admin);
  const onDuty = await loadOnDutyStaffIds(admin, date);
  const plan = planMorningMessages(users, toPlanTasks(tasks, store), sides, settings.lineRolePrefs, onDuty);

  const jobs: SendJob[] = plan.map((entry) =>
    entry.kind === "flex_daily"
      ? {
          userId: entry.user.lineUserId,
          dedupeKey: `morning:${date}:${entry.user.staffId}`,
          meta: { notificationType: "morning", staffId: entry.user.staffId },
          messages: [
            buildDailyCleaningFlex({
              date,
              count: entry.tasks.length,
              totalMinutes: entry.tasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0),
              tasks: toFlexTasks(entry.tasks),
              liffTodayUrl: liffTodayUrl(),
            }),
          ] as LineMessage[],
        }
      : {
          userId: entry.user.lineUserId,
          dedupeKey: `morning-digest:${date}:${entry.user.staffId}`,
          meta: { notificationType: "morning-digest", staffId: entry.user.staffId },
          messages: [
            {
              type: "text",
              text: buildScheduleDigestText({
                date,
                tasks: entry.tasks,
                withManagementSummary:
                  entry.user.jobTitle === "manager" || entry.user.jobTitle === "cleaning_leader",
                appUrl: getSiteUrl(),
              }),
            },
          ],
        },
  );

  return runJobs(admin, token, jobs, !!dry);
}

// ---------------------------------------------------------------------------
// progress: 途中進捗（設定時刻）。received-ON の役職へスコープ集計 ＋ 未実施一覧
// ---------------------------------------------------------------------------
export async function dispatchProgress(args: {
  admin: SupabaseClient;
  settings: NotificationSettings;
  store: StoreSettings;
  tasks: CleaningTask[];
  date: string;
  nowLabel: string;
  dry?: boolean;
}): Promise<DispatchSummary> {
  const { admin, settings, store, tasks, date, nowLabel, dry } = args;
  if (!settings.lineEnabled) return { skipped: "line_disabled", targeted: 0, sent: 0, skippedDup: 0, failed: 0 };
  const token = getSender(settings);
  if (!token) return { skipped: "no_token", targeted: 0, sent: 0, skippedDup: 0, failed: 0 };

  const { users, sides } = await baseCtx(admin);
  const onDuty = await loadOnDutyStaffIds(admin, date);
  const plan = planProgressRecipients(users, toPlanTasks(tasks, store), sides, settings.lineRolePrefs, onDuty);

  // 進捗の重複ガードは「時刻スロット」単位（30分に丸め）
  const slot = nowLabel.replace(":", "");
  const jobs: SendJob[] = plan.map((p) => ({
    userId: p.user.lineUserId,
    dedupeKey: `progress:${date}:${slot}:${p.user.staffId}`,
    meta: { notificationType: "progress", staffId: p.user.staffId },
    messages: [
      {
        type: "text",
        text: buildProgressText({
          nowLabel,
          planned: p.planned,
          done: p.done,
          missedTasks: p.missed,
          appUrl: getSiteUrl(),
        }),
      },
    ],
  }));

  return runJobs(admin, token, jobs, !!dry);
}

// ---------------------------------------------------------------------------
// pending（期限前）/ overdue（期限超過）: 担当者へ Flex、リーダー / 店長へまとめテキスト
// ---------------------------------------------------------------------------
export async function dispatchDeadline(args: {
  admin: SupabaseClient;
  settings: NotificationSettings;
  store: StoreSettings;
  tasks: CleaningTask[]; // 対象タスク（pending: 期限接近で未着手 / overdue: status=overdue）
  kind: Extract<LineNotifyType, "pending" | "overdue">;
  date: string;
  /** pending のとき offset を dedupe key に含める */
  offsetMinutes?: number;
  dry?: boolean;
}): Promise<DispatchSummary> {
  const { admin, settings, store, tasks, kind, date, offsetMinutes, dry } = args;
  if (!settings.lineEnabled) return { skipped: "line_disabled", targeted: 0, sent: 0, skippedDup: 0, failed: 0 };
  const token = getSender(settings);
  if (!token) return { skipped: "no_token", targeted: 0, sent: 0, skippedDup: 0, failed: 0 };
  if (tasks.length === 0) return { targeted: 0, sent: 0, skippedDup: 0, failed: 0 };

  const { users, sides } = await baseCtx(admin);
  const onDuty = await loadOnDutyStaffIds(admin, date);
  const plan = planPerTaskRecipients(kind, users, toPlanTasks(tasks, store), sides, settings.lineRolePrefs, onDuty);

  const suffix = kind === "pending" ? `pending:${offsetMinutes ?? "x"}` : "overdue";
  const jobs: SendJob[] = [];
  for (const p of plan) {
    if (p.user.jobTitle === "staff") {
      // タスク単位に個別 Flex
      for (const t of p.tasks) {
        jobs.push({
          userId: p.user.lineUserId,
          dedupeKey: `${suffix}:${t.id}:${p.user.staffId}`,
          meta: { notificationType: suffix, staffId: p.user.staffId, cleaningTaskId: t.id },
          messages: [
            kind === "overdue"
              ? buildOverdueFlex({ tasks: toFlexTasks([t]), liffTodayUrl: liffTodayUrl() })
              : buildReminderFlex({ tasks: toFlexTasks([t]), liffTodayUrl: liffTodayUrl() }),
          ] as LineMessage[],
        });
      }
    } else {
      // リーダー / 店長にはスコープ内の未実施をまとめて1通
      const ids = p.tasks.map((t) => t.id).sort().join(",");
      jobs.push({
        userId: p.user.lineUserId,
        dedupeKey: `${suffix}-digest:${ids}:${p.user.staffId}`,
        meta: { notificationType: `${suffix}-digest`, staffId: p.user.staffId },
        messages: [
          {
            type: "text",
            text: buildMissedDigestText({
              heading: kind === "overdue" ? "期限超過の清掃" : "未実施の清掃",
              tasks: p.tasks,
              appUrl: getSiteUrl(),
            }),
          },
        ],
      });
    }
  }

  return runJobs(admin, token, jobs, !!dry);
}

// ---------------------------------------------------------------------------
// closing: 閉店後の店舗全体レポートを received-ON の役職へ
// ---------------------------------------------------------------------------
export async function dispatchClosing(args: {
  admin: SupabaseClient;
  settings: NotificationSettings;
  store: StoreSettings;
  tasks: CleaningTask[];
  date: string;
  dry?: boolean;
}): Promise<DispatchSummary> {
  const { admin, settings, store, tasks, date, dry } = args;
  if (!settings.lineEnabled) return { skipped: "line_disabled", targeted: 0, sent: 0, skippedDup: 0, failed: 0 };
  const token = getSender(settings);
  if (!token) return { skipped: "no_token", targeted: 0, sent: 0, skippedDup: 0, failed: 0 };

  const users = await loadTargets(admin);
  const onDuty = await loadOnDutyStaffIds(admin, date);
  const recipients = planClosingRecipients(users, settings.lineRolePrefs, onDuty);
  if (recipients.length === 0) return { targeted: 0, sent: 0, skippedDup: 0, failed: 0 };

  const plan = toPlanTasks(tasks, store).filter((t) => t.status !== "skipped");
  const text = buildClosingReportText({
    date,
    planned: plan.length,
    done: plan.filter((t) => t.status === "done").length,
    missed: plan.filter((t) => t.status !== "done"),
    appUrl: getSiteUrl(),
  });

  const jobs: SendJob[] = recipients.map((u) => ({
    userId: u.lineUserId,
    dedupeKey: `closing:${date}:${u.staffId}`,
    meta: { notificationType: "closing", staffId: u.staffId },
    messages: [{ type: "text", text }],
  }));

  return runJobs(admin, token, jobs, !!dry);
}
