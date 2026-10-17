"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { getSiteUrl, resolveLineConfig } from "@/lib/env";
import { postToSlackWebhook } from "@/lib/slack/notify";
import { pushLineText } from "@/lib/line/push";
import {
  JOB_TITLES,
  LINE_NOTIFY_TYPES,
  type JobTitle,
  type LineNotifyType,
  type LineRolePrefs,
} from "@/config/constants";
import { fail, ok, toMessage, type ActionResult } from "./result";

const schema = z.object({
  slackEnabled: z.boolean(),
  slackWebhookUrl: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine(
      (v) => v == null || /^https:\/\/hooks\.slack\.com\//.test(v),
      "Webhook URL は https://hooks.slack.com/ で始まる必要があります",
    ),
  notifyDailyPlan: z.boolean(),
  notifyOverdue: z.boolean(),
  notifyClosingSummary: z.boolean(),
});

function bool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}

export async function updateNotificationSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = schema.safeParse({
      slackEnabled: bool(formData.get("slackEnabled")),
      slackWebhookUrl: formData.get("slackWebhookUrl") ?? "",
      notifyDailyPlan: bool(formData.get("notifyDailyPlan")),
      notifyOverdue: bool(formData.get("notifyOverdue")),
      notifyClosingSummary: bool(formData.get("notifyClosingSummary")),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const d = parsed.data;
    if (d.slackEnabled && !d.slackWebhookUrl) {
      return fail("Slack 通知を有効にするには Webhook URL が必要です");
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cleaning_notification_settings")
      .update({
        slack_enabled: d.slackEnabled,
        slack_webhook_url: d.slackWebhookUrl,
        notify_daily_plan: d.notifyDailyPlan,
        notify_overdue: d.notifyOverdue,
        notify_closing_summary: d.notifyClosingSummary,
      })
      .eq("id", 1)
      .select("id")
      .maybeSingle();
    if (error) return fail(`保存に失敗しました: ${error.message}`);
    if (!data) {
      return fail(
        "清掃の通知設定が見つかりません。0008_cleaning_notification_settings.sql の適用状況を管理者に確認してください。",
      );
    }
    revalidatePath("/admin/notifications");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// ---------------------------------------------------------------------------
// LINE 設定
// ---------------------------------------------------------------------------
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const nullableStr = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const lineSchema = z.object({
  lineEnabled: z.boolean(),
  lineChannelAccessToken: nullableStr,
  lineChannelSecret: nullableStr,
  lineMorningTime: z.string().regex(HHMM),
  lineProgressTimes: z.array(z.string().regex(HHMM)).max(6),
  lineReminderOffsets: z.array(z.number().int().min(-720).max(720)).max(6),
  lineClosingTime: z.string().regex(HHMM),
  lineRolePrefs: z.record(z.string(), z.record(z.string(), z.boolean())),
});

function normalizeRolePrefs(raw: Record<string, Record<string, boolean>>): LineRolePrefs {
  const out = {} as LineRolePrefs;
  for (const job of JOB_TITLES) {
    const src = raw[job] ?? {};
    out[job as JobTitle] = LINE_NOTIFY_TYPES.reduce(
      (acc, t) => {
        acc[t as LineNotifyType] = src[t] === true;
        return acc;
      },
      {} as Record<LineNotifyType, boolean>,
    );
  }
  return out;
}

export async function updateLineSettingsAction(
  payloadJson: string,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    let raw: unknown;
    try {
      raw = JSON.parse(payloadJson);
    } catch {
      return fail("入力データの形式が不正です");
    }
    const parsed = lineSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const d = parsed.data;

    // env にトークンが無く、DB にも無いのに有効化はできない
    const hasEnvToken = resolveLineConfig() != null;
    if (d.lineEnabled && !hasEnvToken && !d.lineChannelAccessToken) {
      return fail(
        "LINE 通知を有効にするにはチャネルアクセストークンが必要です（env の LINE_CHANNEL_ACCESS_TOKEN かこの画面で設定）",
      );
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("notification_settings")
      .update({
        line_enabled: d.lineEnabled,
        line_channel_access_token: d.lineChannelAccessToken,
        line_channel_secret: d.lineChannelSecret,
        line_morning_time: d.lineMorningTime,
        line_progress_times: [...new Set(d.lineProgressTimes)].sort(),
        line_reminder_offsets: [...new Set(d.lineReminderOffsets)].sort((a, b) => a - b),
        line_closing_time: d.lineClosingTime,
        line_role_prefs: normalizeRolePrefs(d.lineRolePrefs),
      })
      .eq("id", 1);
    if (error) return fail(`保存に失敗しました: ${error.message}`);
    revalidatePath("/admin/notifications");
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

/** 自分（管理者）の LINE へテスト送信 */
export async function sendTestLineAction(): Promise<ActionResult> {
  try {
    const me = await assertAdmin();
    const supabase = await createClient();
    const { data: settings } = await supabase
      .from("notification_settings")
      .select("line_channel_access_token, line_channel_secret")
      .eq("id", 1)
      .maybeSingle();
    const line = resolveLineConfig({
      accessToken: (settings as { line_channel_access_token: string | null } | null)
        ?.line_channel_access_token,
      channelSecret: (settings as { line_channel_secret: string | null } | null)
        ?.line_channel_secret,
    });
    if (!line) return fail("LINE のチャネルアクセストークンが未設定です。");

    const { data: acct } = await supabase
      .from("staff_line_accounts")
      .select("line_user_id, is_active")
      .eq("staff_id", me.id)
      .maybeSingle();
    const to =
      acct && (acct as { is_active: boolean }).is_active
        ? (acct as { line_user_id: string }).line_user_id
        : null;
    if (!to) {
      return fail("あなたの LINE が未連携です。LINE 公式アカウントから登録してください。");
    }
    await pushLineText(
      line.accessToken,
      to,
      "【テスト通知】店舗清掃マネージャーの LINE 連携テストです。",
    );
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}

/** 設定済み Webhook へテスト投稿 */
export async function sendTestSlackAction(): Promise<ActionResult> {
  try {
    await assertAdmin();
    const supabase = await createClient();
    const { data } = await supabase
      .from("cleaning_notification_settings")
      .select("slack_webhook_url")
      .eq("id", 1)
      .maybeSingle();
    const url = (data as { slack_webhook_url: string | null } | null)?.slack_webhook_url;
    if (!url) return fail("Webhook URL が未設定です。先に保存してください。");
    await postToSlackWebhook(url, {
      text: "【テスト通知】店舗清掃マネージャーからの接続テストです。",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:white_check_mark: *接続テスト成功*\n店舗清掃マネージャー（<${getSiteUrl()}|アプリ>）`,
          },
        },
      ],
    });
    return ok();
  } catch (e) {
    return fail(toMessage(e));
  }
}
