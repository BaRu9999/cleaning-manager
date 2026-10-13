import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown> | null>,
  touched: [] as string[],
  post: vi.fn(),
  authorize: vi.fn(),
}));

// Two distinct settings rows in one database: catches accidental reads/writes
// of the legacy row, including the service-role notification paths.
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
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        eq: () => query,
        maybeSingle: async () => result(),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client() }));
vi.mock("@/lib/auth/guard", () => ({ assertAdmin: state.authorize }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/slack/notify", () => ({ postToSlackWebhook: state.post }));
vi.mock("@/lib/cleaning/run-generation", () => ({ runGeneration: async () => undefined }));
vi.mock("@/lib/cron/shared", () => ({
  authorizeCron: () => true,
  cronParams: () => ({ date: "2026-10-13", dry: false, force: false }),
  loadDateTasksAdmin: async () => [],
  unauthorized: () => new Response(null, { status: 401 }),
}));

import { getNotificationSettings, getNotificationSettingsAdmin } from "./settings";
import { sendTestSlackAction, updateNotificationSettingsAction } from "./notification-actions";
import { GET as dailyPlan } from "@/app/api/cron/slack-daily-plan/route";
import { GET as closingSummary } from "@/app/api/cron/slack-closing-summary/route";

const cleaningUrl = "https://hooks.slack.com/services/test/cleaning/placeholder";
const inventoryUrl = "https://hooks.slack.com/services/test/inventory/placeholder";
function form(url: string, enabled = true) {
  const data = new FormData();
  data.set("slackWebhookUrl", url);
  data.set("slackEnabled", String(enabled));
  data.set("notifyDailyPlan", "true");
  data.set("notifyOverdue", "true");
  data.set("notifyClosingSummary", "true");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.authorize.mockResolvedValue(undefined);
  state.touched = [];
  state.rows = {
    notification_settings: { id: 1, slack_enabled: true, slack_webhook_url: inventoryUrl },
    cleaning_notification_settings: {
      id: 1, slack_enabled: true, slack_webhook_url: cleaningUrl,
      notify_daily_plan: true, notify_overdue: true, notify_closing_summary: true,
      last_daily_plan_on: null, last_closing_summary_on: null,
    },
  };
});

describe("cleaning / inventory notification isolation", () => {
  it("reads cleaning settings for both the page and Cron", async () => {
    expect((await getNotificationSettings())?.slackWebhookUrl).toBe(cleaningUrl);
    expect((await getNotificationSettingsAdmin()).slackWebhookUrl).toBe(cleaningUrl);
    expect(state.touched).not.toContain("notification_settings");
  });

  it("changing, disabling and clearing cleaning does not alter inventory", async () => {
    const inventory = { ...state.rows.notification_settings };
    expect((await updateNotificationSettingsAction(form(cleaningUrl + "-new"))).ok).toBe(true);
    expect(state.rows.cleaning_notification_settings?.slack_webhook_url).toBe(cleaningUrl + "-new");
    expect((await updateNotificationSettingsAction(form("", false))).ok).toBe(true);
    expect(state.rows.cleaning_notification_settings?.slack_enabled).toBe(false);
    expect(state.rows.cleaning_notification_settings?.slack_webhook_url).toBeNull();
    expect(state.rows.notification_settings).toEqual(inventory);
    expect(state.touched).not.toContain("notification_settings");
  });

  it("inventory changes do not change the destination of a cleaning test", async () => {
    state.rows.notification_settings!.slack_webhook_url = inventoryUrl + "-changed";
    expect((await sendTestSlackAction()).ok).toBe(true);
    expect(state.post).toHaveBeenCalledWith(cleaningUrl, expect.any(Object));
  });

  it("missing dedicated row does not fall back to the legacy destination", async () => {
    delete state.rows.cleaning_notification_settings;
    expect(await getNotificationSettings()).toBeNull();
    expect((await getNotificationSettingsAdmin()).slackEnabled).toBe(false);
    expect((await updateNotificationSettingsAction(form(cleaningUrl))).ok).toBe(false);
    expect((await sendTestSlackAction()).ok).toBe(false);
    await dailyPlan(new Request("https://example.test/api/cron/slack-daily-plan"));
    await closingSummary(new Request("https://example.test/api/cron/slack-closing-summary"));
    expect(state.post).not.toHaveBeenCalled();
    expect(state.touched).not.toContain("notification_settings");
  });

  it.each([
    ["daily", dailyPlan, "last_daily_plan_on"],
    ["closing", closingSummary, "last_closing_summary_on"],
  ] as const)("%s Cron posts and records its dedup date only for cleaning", async (_name, handler, column) => {
    const inventory = { ...state.rows.notification_settings };
    await handler(new Request("https://example.test/api/cron"));
    expect(state.post).toHaveBeenCalledWith(cleaningUrl, expect.any(Object));
    expect(state.rows.cleaning_notification_settings?.[column]).toBe("2026-10-13");
    expect(state.rows.notification_settings).toEqual(inventory);
    await handler(new Request("https://example.test/api/cron"));
    expect(state.post).toHaveBeenCalledTimes(1);
    expect(state.touched).not.toContain("notification_settings");
  });

  it("keeps settings changes and test sends behind the admin guard", async () => {
    state.authorize.mockRejectedValue(new Error("管理者のみ"));
    expect((await updateNotificationSettingsAction(form(cleaningUrl))).ok).toBe(false);
    expect((await sendTestSlackAction()).ok).toBe(false);
    expect(state.touched).toEqual([]);
    expect(state.post).not.toHaveBeenCalled();
  });
});
