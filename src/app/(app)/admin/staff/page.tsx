import { requireAdmin } from "@/lib/auth/guard";
import { listStaff } from "@/lib/data/staff";
import { getStoreSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { StaffManager } from "@/components/admin/StaffManager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const me = await requireAdmin();
  const [staff, store] = await Promise.all([listStaff(), getStoreSettings()]);

  return (
    <div>
      <PageHeader
        title="スタッフ管理"
        description="新規登録したスタッフを承認し、権限（管理者/スタッフ）と担当ポジションを設定します。招待は各自が /login の「新規登録」から行います。"
      />
      <StaffManager
        meId={me.id}
        positions={store.positions}
        staff={staff.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          email: s.email,
          role: s.role,
          position: s.position,
          active: s.active,
        }))}
      />
    </div>
  );
}
