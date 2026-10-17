import { requireAdmin } from "@/lib/auth/guard";
import { getTodayAssignmentCounts, listStaff } from "@/lib/data/staff";
import { listCategories } from "@/lib/data/masters";
import { getStoreSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { StaffManager } from "@/components/admin/StaffManager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const me = await requireAdmin();
  const [staff, counts, store, categories] = await Promise.all([
    listStaff(),
    getTodayAssignmentCounts(),
    getStoreSettings(),
    listCategories({ includeInactive: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="スタッフ管理"
        description="スタッフの承認・役職（一般/清掃リーダー/ホールリーダー/店長）・担当ポジション・LINE 連携状況を管理します。LINE 未連携のスタッフには通知が届きません。"
      />
      <StaffManager
        meId={me.id}
        positions={store.positions}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.map((s) => {
          const c = counts.get(s.id) ?? { assigned: 0, done: 0 };
          return {
            id: s.id,
            displayName: s.displayName,
            email: s.email,
            role: s.role,
            jobTitle: s.jobTitle,
            position: s.position,
            active: s.active,
            staffCode: s.staffCode,
            visibleCategoryIds: s.visibleCategoryIds,
            lineLinked: s.lineLinked,
            hasLogin: s.hasLogin,
            todayAssigned: c.assigned,
            todayDone: c.done,
          };
        })}
      />
    </div>
  );
}
