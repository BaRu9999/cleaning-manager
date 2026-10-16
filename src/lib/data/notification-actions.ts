"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { getSiteUrl } from "@/lib/env";
import { postToSlackWebhook } from "@/lib/slack/notify";
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
    if (!data) return fail("清掃の通知設定が見つかりません。管理者に設定の初期化を依頼してください。");
    revalidatePath("/admin/notifications");
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
