import { requireAdmin } from "@/lib/auth/guard";
import { getStoreSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { StoreSettingsForm } from "@/components/admin/StoreSettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getStoreSettings();

  return (
    <div>
      <PageHeader
        title="店舗設定"
        description="店名・営業時間・清掃時間帯・担当ポジションを設定します。日時はすべて日本時間（Asia/Tokyo）で扱います。"
      />
      <StoreSettingsForm initial={settings} />
    </div>
  );
}
