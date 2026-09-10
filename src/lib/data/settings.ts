import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_POSITIONS, DEFAULT_TIME_SLOTS } from "@/config/constants";
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

/** 店舗設定（シングルトン）。行が無ければ既定値。 */
export async function getStoreSettings(): Promise<StoreSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return FALLBACK_STORE_SETTINGS;
  return mapStoreSettings(data as Record<string, unknown>);
}

/** 通知設定（管理者のみ RLS 許可）。 */
export async function getNotificationSettings(): Promise<NotificationSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return mapNotificationSettings(data as Record<string, unknown>);
}

/** Cron 用: service_role で店舗設定を取得 */
export async function getStoreSettingsAdmin(): Promise<StoreSettings> {
  const admin = createAdminClient();
  const { data } = await admin.from("store_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return FALLBACK_STORE_SETTINGS;
  return mapStoreSettings(data as Record<string, unknown>);
}

/** Cron 用: service_role で通知設定を取得 */
export async function getNotificationSettingsAdmin(): Promise<NotificationSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("notification_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!data) {
    return {
      slackEnabled: false,
      slackWebhookUrl: null,
      notifyDailyPlan: true,
      notifyOverdue: true,
      notifyClosingSummary: true,
      lastDailyPlanOn: null,
      lastClosingSummaryOn: null,
    };
  }
  return mapNotificationSettings(data as Record<string, unknown>);
}
