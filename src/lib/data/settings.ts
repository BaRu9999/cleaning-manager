import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_LINE_CLOSING_TIME,
  DEFAULT_LINE_MORNING_TIME,
  DEFAULT_LINE_PROGRESS_TIMES,
  DEFAULT_LINE_REMINDER_OFFSETS,
  DEFAULT_LINE_ROLE_PREFS,
  DEFAULT_POSITIONS,
  DEFAULT_TIME_SLOTS,
} from "@/config/constants";
import { mapNotificationSettings, mapStoreSettings } from "./mappers";
import type { NotificationSettings, StoreSettings } from "@/lib/types/domain";

const FALLBACK_STORE_SETTINGS: StoreSettings = {
  storeName: "店舗",
  timezone: "Asia/Tokyo",
  openTime: "10:00",
  closeTime: "22:00",
  timeSlots: DEFAULT_TIME_SLOTS,
  positions: DEFAULT_POSITIONS,
};

/**
 * 店舗設定（シングルトン）。行が無ければ既定値。
 * `cache()`: 同一リクエスト内（layout + page 等）での重複取得を防ぐ。
 * 更新は Server Action からの別リクエストになるため古いキャッシュを持ち越さない。
 */
export const getStoreSettings = cache(async (): Promise<StoreSettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return FALLBACK_STORE_SETTINGS;
  return mapStoreSettings(data as Record<string, unknown>);
});

/**
 * 通知設定（管理者のみ RLS 許可）。`cache()`: 同一リクエスト内の重複取得を防ぐ。
 * Slack関連は清掃専用の cleaning_notification_settings、LINE関連は notification_settings
 * （棚卸し等と共有、line_* 列は清掃専用）から読み、1つにまとめて返す。
 * cleaning_notification_settings の行が無ければ null（棚卸し側の共有設定へはフォールバックしない）。
 */
export const getNotificationSettings = cache(
  async (): Promise<NotificationSettings | null> => {
    const supabase = await createClient();
    const [{ data: cleaning, error }, { data: line }] = await Promise.all([
      supabase.from("cleaning_notification_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("notification_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (error || !cleaning) return null;
    return mapNotificationSettings(
      cleaning as Record<string, unknown>,
      line as Record<string, unknown> | null,
    );
  },
);

/** Cron 用: service_role で店舗設定を取得 */
export async function getStoreSettingsAdmin(): Promise<StoreSettings> {
  const admin = createAdminClient();
  const { data } = await admin.from("store_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return FALLBACK_STORE_SETTINGS;
  return mapStoreSettings(data as Record<string, unknown>);
}

/**
 * Cron 用: service_role で通知設定を取得。
 * Slack関連は清掃専用の cleaning_notification_settings、LINE関連は notification_settings
 * （棚卸し等と共有、line_* 列は清掃専用）から読み、1つにまとめて返す。
 * cleaning_notification_settings の行が無い場合は Slack 無効の既定値（棚卸し側の共有設定へは
 * フォールバックしない。Cron が誤って棚卸しの Webhook へ送らないようにするため）。
 */
export async function getNotificationSettingsAdmin(): Promise<NotificationSettings> {
  const admin = createAdminClient();
  const [{ data: cleaning }, { data: line }] = await Promise.all([
    admin.from("cleaning_notification_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("notification_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (!cleaning) {
    return {
      slackEnabled: false,
      slackWebhookUrl: null,
      notifyDailyPlan: true,
      notifyOverdue: true,
      notifyClosingSummary: true,
      lastDailyPlanOn: null,
      lastClosingSummaryOn: null,
      lineEnabled: false,
      lineChannelAccessToken: null,
      lineChannelSecret: null,
      lineMorningTime: DEFAULT_LINE_MORNING_TIME,
      lineProgressTimes: [...DEFAULT_LINE_PROGRESS_TIMES],
      lineReminderOffsets: [...DEFAULT_LINE_REMINDER_OFFSETS],
      lineClosingTime: DEFAULT_LINE_CLOSING_TIME,
      lineRolePrefs: JSON.parse(JSON.stringify(DEFAULT_LINE_ROLE_PREFS)),
      lastLineMorningOn: null,
      lastLineProgressAt: null,
      lastLineClosingOn: null,
    };
  }
  return mapNotificationSettings(
    cleaning as Record<string, unknown>,
    line as Record<string, unknown> | null,
  );
}
