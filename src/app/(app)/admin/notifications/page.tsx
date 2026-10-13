import { requireAdmin } from "@/lib/auth/guard";
import { getNotificationSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { NotificationSettingsForm } from "@/components/admin/NotificationSettingsForm";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireAdmin();
  const settings = await getNotificationSettings();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Slack 通知設定"
        description="本日の清掃予定・未実施・閉店時結果を Slack に自動通知します。送信はすべてサーバー側の Cron から行われます。"
      />
      {settings ? (
        <NotificationSettingsForm initial={settings} />
      ) : (
        <Alert tone="warning" title="設定行が見つかりません">
          <code className="text-xs">supabase/migrations/0003_cleaning_notification_settings.sql</code>{" "}
          を適用してください（<code>cleaning_notification_settings</code> の初期行が作成されます）。
        </Alert>
      )}

      <Alert tone="info" title="Cron の設定">
        <code className="text-xs">vercel.json</code>{" "}
        に登録済み。Vercel の環境変数に <code className="text-xs">CRON_SECRET</code>{" "}
        を設定すると自動実行されます。詳細は README の「Cron設定」を参照。
      </Alert>
    </div>
  );
}
