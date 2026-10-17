import { requireAdmin } from "@/lib/auth/guard";
import { getNotificationSettings } from "@/lib/data/settings";
import { resolveLineConfig } from "@/lib/env";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { NotificationSettingsForm } from "@/components/admin/NotificationSettingsForm";
import { LineSettingsForm } from "@/components/admin/LineSettingsForm";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireAdmin();
  const settings = await getNotificationSettings();
  const hasEnvToken = resolveLineConfig() != null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="通知設定"
        description="Slack（1チャンネルへ全体）と LINE（役職別に出し分け）。送信はすべてサーバー側の Cron から行われます。"
      />
      {settings ? (
        <>
          <NotificationSettingsForm initial={settings} />
          <LineSettingsForm initial={settings} hasEnvToken={hasEnvToken} />
        </>
      ) : (
        <Alert tone="warning" title="設定行が見つかりません">
          <code className="text-xs">supabase/migrations/0008_cleaning_notification_settings.sql</code>{" "}
          を適用してください（<code className="text-xs">cleaning_notification_settings</code>{" "}
          の初期行が作成されます。0001・0003 は適用済みの前提です）。
        </Alert>
      )}

      <Alert tone="info" title="Cron の設定">
        <code className="text-xs">vercel.json</code>{" "}
        に登録済み。Vercel の環境変数に <code className="text-xs">CRON_SECRET</code>{" "}
        （LINE を使う場合は <code className="text-xs">LINE_CHANNEL_ACCESS_TOKEN</code> /{" "}
        <code className="text-xs">LINE_CHANNEL_SECRET</code>）を設定してください。詳細は README。
      </Alert>
    </div>
  );
}
