/**
 * 清掃の Slack 通知設定（cleaning_notification_settings）が、同じ Supabase プロジェクトを
 * 共有する棚卸し管理システム等の notification_settings と干渉しないことの回帰テスト。
 *
 * 前提: LINE 関連（line_*）は清掃専用の列のため、引き続き notification_settings を
 * 読み書きする（分離対象はあくまで Slack 関連＋送信済み日時のみ）。LINE の読み書きが
 * 今回の変更で壊れていないことも合わせて確認する。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown> | null>,
  touched: [] as string[],
  postSlack: vi.fn(),
  pushLine: vi.fn(),
  authorize: vi.fn(),
}));

// 1つのSupabaseプロジェクトに notification_settings（棚卸し等と共有）と
// cleaning_notification_settings（清掃専用）の2行があるのを模す。
// どちらのテーブルに触れたかを state.touched に記録し、誤って共有テーブルの
// Slack列を書き換えていないかを検証できるようにする。
function client() {
  return {
    from(table: string) {
      state.touched.push(table);
      let patch: Record<string, unknown> | undefined;
      const result = () => {
        const row = state.rows[table];
        if (row && patch) Object.assign(row, patch);
        return { data: row ?? null, error: null };
      };
      const query = {
        select: () => query,
        update: (value: Record<string, unknown>) => {
          patch = value;
          return query;
        },
        eq: () => query,
        maybeSingle: async () => result(),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client() }));
vi.mock("@/lib/auth/guard", () => ({ assertAdmin: state.authorize }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/slack/notify", () => ({ postToSlackWebhook: state.postSlack }));
vi.mock("@/lib/line/push", () => ({ pushLineText: state.pushLine }));
vi.mock("@/lib/cleaning/run-generation", () => ({ runGeneration: async () => undefined }));
vi.mock("@/lib/line/dispatch", () => ({
  dispatchClosing: vi.fn(async () => ({ targeted: 0, sent: 0, skippedDup: 0, failed: 0 })),
}));
vi.mock("@/lib/cron/shared", () => ({
  authorizeCron: () => true,
  cronParams: () => ({ date: "2026-10-17", dry: false, force: false }),
  loadDateTasksAdmin: async () => [],
  unauthorized: () => new Response(null, { status: 401 }),
}));

import {
  getNotificationSettings,
  getNotificationSettingsAdmin,
} from "./settings";
import {
  sendTestLineAction,
  sendTestSlackAction,
  updateLineSettingsAction,
  updateNotificationSettingsAction,
} from "./notification-actions";
import { GET as dailyPlan } from "@/app/api/cron/slack-daily-plan/route";
import { GET as closingSummary } from "@/app/api/cron/slack-closing-summary/route";

const cleaningUrl = "https://hooks.slack.com/services/test/cleaning/placeholder";
const inventoryUrl = "https://hooks.slack.com/services/test/inventory/placeholder";

function slackForm(url: string, enabled = true) {
  const data = new FormData();
  data.set("slackWebhookUrl", url);
  data.set("slackEnabled", String(enabled));
  data.set("notifyDailyPlan", "true");
  data.set("notifyOverdue", "true");
  data.set("notifyClosingSummary", "true");
  return data;
}

const defaultLinePrefs = {
  staff: { morning: true, progress: false, pending: true, overdue: true, closing: false },
  cleaning_leader: { morning: true, progress: true, pending: true, overdue: true, closing: true },
  hall_leader: { morning: true, progress: false, pending: true, overdue: true, closing: false },
  manager: { morning: true, progress: true, pending: true, overdue: true, closing: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.authorize.mockResolvedValue({ id: "admin-1", role: "admin" });
  state.touched = [];
  state.rows = {
    // 棚卸し等と共有する行。slack_webhook_url は棚卸し側が設定した値、line_* は清掃専用。
    notification_settings: {
      id: 1,
      slack_enabled: true,
      slack_webhook_url: inventoryUrl,
      line_enabled: true,
      line_channel_access_token: "token-abc",
      line_channel_secret: "secret-abc",
      line_morning_time: "09:30",
      line_progress_times: ["17:00"],
      line_reminder_offsets: [-30],
      line_closing_time: "23:00",
      line_role_prefs: defaultLinePrefs,
      last_line_morning_on: null,
      last_line_progress_at: null,
      last_line_closing_on: null,
    },
    cleaning_notification_settings: {
      id: 1,
      slack_enabled: true,
      slack_webhook_url: cleaningUrl,
      notify_daily_plan: true,
      notify_overdue: true,
      notify_closing_summary: true,
      last_daily_plan_on: null,
      last_closing_summary_on: null,
    },
    staff_line_accounts: { line_user_id: "U_test", is_active: true },
  };
});

describe("Slack設定の分離（清掃 / 棚卸し）", () => {
  it("清掃のSlack設定はcleaning_notification_settingsから読む", async () => {
    expect((await getNotificationSettings())?.slackWebhookUrl).toBe(cleaningUrl);
    expect((await getNotificationSettingsAdmin()).slackWebhookUrl).toBe(cleaningUrl);
  });

  it("清掃のSlack設定を変更・無効化しても棚卸し側の行は変わらない", async () => {
    const inventorySnapshot = { ...state.rows.notification_settings };
    expect((await updateNotificationSettingsAction(slackForm(cleaningUrl + "-new"))).ok).toBe(true);
    expect(state.rows.cleaning_notification_settings?.slack_webhook_url).toBe(
      cleaningUrl + "-new",
    );
    expect((await updateNotificationSettingsAction(slackForm("", false))).ok).toBe(true);
    expect(state.rows.cleaning_notification_settings?.slack_enabled).toBe(false);
    expect(state.rows.cleaning_notification_settings?.slack_webhook_url).toBeNull();
    expect(state.rows.notification_settings).toEqual(inventorySnapshot);
  });

  it("棚卸し側のURLが変わっても清掃のテスト送信先は変わらない", async () => {
    state.rows.notification_settings!.slack_webhook_url = inventoryUrl + "-changed";
    expect((await sendTestSlackAction()).ok).toBe(true);
    expect(state.postSlack).toHaveBeenCalledWith(cleaningUrl, expect.any(Object));
  });

  it("清掃専用行が無い場合は棚卸し側の共有設定へフォールバックしない", async () => {
    delete state.rows.cleaning_notification_settings;
    expect(await getNotificationSettings()).toBeNull();
    expect((await getNotificationSettingsAdmin()).slackEnabled).toBe(false);
    expect((await updateNotificationSettingsAction(slackForm(cleaningUrl))).ok).toBe(false);
    expect((await sendTestSlackAction()).ok).toBe(false);
    await dailyPlan(new Request("https://example.test/api/cron/slack-daily-plan"));
    await closingSummary(new Request("https://example.test/api/cron/slack-closing-summary"));
    expect(state.postSlack).not.toHaveBeenCalled();
  });

  it.each([
    ["daily", dailyPlan, "last_daily_plan_on"],
    ["closing", closingSummary, "last_closing_summary_on"],
  ] as const)(
    "%s Cronは清掃のWebhookへ送信し、送信済み日時は清掃専用テーブルにのみ記録する",
    async (_name, handler, column) => {
      const inventorySnapshot = { ...state.rows.notification_settings };
      await handler(new Request("https://example.test/api/cron"));
      expect(state.postSlack).toHaveBeenCalledWith(cleaningUrl, expect.any(Object));
      expect(state.rows.cleaning_notification_settings?.[column]).toBe("2026-10-17");
      expect(state.rows.notification_settings).toEqual(inventorySnapshot);

      await handler(new Request("https://example.test/api/cron"));
      expect(state.postSlack).toHaveBeenCalledTimes(1); // 二重送信ガード
    },
  );

  it("設定変更・テスト送信は管理者ガードの外に出ない", async () => {
    state.authorize.mockRejectedValue(new Error("管理者のみ"));
    expect((await updateNotificationSettingsAction(slackForm(cleaningUrl))).ok).toBe(false);
    expect((await sendTestSlackAction()).ok).toBe(false);
    expect(state.postSlack).not.toHaveBeenCalled();
  });
});

describe("LINE設定は今回の分離の影響を受けない（notification_settingsのまま）", () => {
  it("LINE設定はnotification_settingsから読め、Slack分離後も値が残っている", async () => {
    const settings = await getNotificationSettingsAdmin();
    expect(settings.lineEnabled).toBe(true);
    expect(settings.lineChannelAccessToken).toBe("token-abc");
    expect(settings.lineMorningTime).toBe("09:30");
  });

  it("LINE設定の保存はnotification_settingsへ書き込み、清掃のSlack設定には影響しない", async () => {
    const cleaningSnapshot = { ...state.rows.cleaning_notification_settings };
    const res = await updateLineSettingsAction(
      JSON.stringify({
        lineEnabled: true,
        lineChannelAccessToken: "token-xyz",
        lineChannelSecret: "secret-xyz",
        lineMorningTime: "10:00",
        lineProgressTimes: ["18:00"],
        lineReminderOffsets: [-15],
        lineClosingTime: "22:30",
        lineRolePrefs: defaultLinePrefs,
      }),
    );
    expect(res.ok).toBe(true);
    expect(state.rows.notification_settings?.line_channel_access_token).toBe("token-xyz");
    expect(state.rows.cleaning_notification_settings).toEqual(cleaningSnapshot);
  });

  it("LINEテスト送信は従来どおり動作する", async () => {
    const res = await sendTestLineAction();
    expect(res.ok).toBe(true);
    expect(state.pushLine).toHaveBeenCalled();
  });
});
