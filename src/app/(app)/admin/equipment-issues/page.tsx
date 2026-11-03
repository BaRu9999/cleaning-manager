import { requireAdmin } from "@/lib/auth/guard";
import { listEquipmentIssues } from "@/lib/data/equipment-issues";
import { EQUIPMENT_STATUS_LABELS, type EquipmentStatus } from "@/config/constants";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { EquipmentIssueCard } from "@/components/admin/EquipmentIssueCard";

export const dynamic = "force-dynamic";

const ORDER: EquipmentStatus[] = ["open", "in_progress", "resolved"];

export default async function EquipmentIssuesPage() {
  await requireAdmin();
  const issues = await listEquipmentIssues();

  const byStatus = new Map<EquipmentStatus, typeof issues>();
  for (const status of ORDER) byStatus.set(status, []);
  for (const i of issues) byStatus.get(i.status)?.push(i);

  const openCount = (byStatus.get("open")?.length ?? 0) + (byStatus.get("in_progress")?.length ?? 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="設備異常"
        description={`未対応・対応中: ${openCount}件`}
      />

      {issues.length === 0 ? (
        <EmptyState
          title="設備異常の報告はありません"
          description="スタッフが清掃中に発見した設備異常は、清掃タスクの詳細画面から報告されます。"
        />
      ) : (
        ORDER.map((status) => {
          const list = byStatus.get(status) ?? [];
          if (list.length === 0) return null;
          return (
            <section key={status}>
              <h2 className="mb-2 text-sm font-bold text-slate-700">
                {EQUIPMENT_STATUS_LABELS[status]}（{list.length}）
              </h2>
              <div className="space-y-2">
                {list.map((issue) => (
                  <EquipmentIssueCard
                    key={issue.id}
                    issue={{
                      id: issue.id,
                      reportedAt: issue.reportedAt,
                      reportedByName: issue.reportedByName,
                      masterName: issue.masterName,
                      areaName: issue.areaName,
                      title: issue.title,
                      description: issue.description,
                      severity: issue.severity,
                      status: issue.status,
                      photoSignedUrl: issue.photoSignedUrl,
                      resolvedAt: issue.resolvedAt,
                      resolvedByName: issue.resolvedByName,
                      resolutionNote: issue.resolutionNote,
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
