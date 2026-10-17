import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { listMasters } from "@/lib/data/masters";
import { getStoreSettings } from "@/lib/data/settings";
import {
  FREQUENCY_LABELS,
  PHOTO_REQUIREMENT_LABELS,
} from "@/config/constants";
import { describeRule } from "@/lib/cleaning/recurrence";
import { slotLabel } from "@/lib/cleaning/slots";
import { formatWorkload } from "@/lib/cleaning/workload";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MasterRowActions } from "@/components/master/MasterRowActions";

export const dynamic = "force-dynamic";

export default async function MasterListPage() {
  await requireAdmin();
  const [masters, store] = await Promise.all([
    listMasters({ includeInactive: true }),
    getStoreSettings(),
  ]);

  return (
    <div>
      <PageHeader
        title="清掃項目マスタ"
        description="清掃名・場所・頻度・時間帯・担当・写真要否を登録します。ここで登録した内容から毎日の清掃タスクが自動生成されます。"
        action={
          <Link href="/admin/master/new">
            <Button size="sm">＋ 新規登録</Button>
          </Link>
        }
      />

      {masters.length === 0 ? (
        <EmptyState
          title="清掃項目がありません"
          description="「新規登録」から最初の清掃項目を追加してください。"
          action={
            <Link href="/admin/master/new">
              <Button size="sm">＋ 新規登録</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {masters.map((m) => {
            const freqs = m.schedules.length
              ? m.schedules
                  .map((s) => describeRule({
                    frequency: s.frequency,
                    weekdays: s.weekdays,
                    daysOfMonth: s.daysOfMonth,
                    intervalDays: s.intervalDays,
                    anchorDate: s.anchorDate,
                  }))
                  .join(" / ")
              : "スケジュール未設定";
            return (
              <li
                key={m.id}
                className={`rounded-xl border bg-white p-3 shadow-sm ${
                  m.active ? "border-slate-200" : "border-slate-200 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/admin/master/${m.id}`}
                        className="text-base font-bold text-slate-900 hover:underline"
                      >
                        {m.name}
                      </Link>
                      {!m.active ? <Badge tone="skipped">無効</Badge> : null}
                      {m.priority === "high" ? <Badge tone="high">優先度高</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {(m.categoryName || "未分類") +
                        (m.areaName ? ` / ${m.areaName}` : "")}
                      {m.position ? ` ・ 担当: ${m.position}` : ""}
                      {m.defaultAssigneeName ? `（${m.defaultAssigneeName}）` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <Badge tone="neutral">{freqs}</Badge>
                      {m.schedules.map((s) => (
                        <Badge key={s.id} tone="info">
                          {slotLabel(s.timeSlot, store.timeSlots)}
                          {s.dueTime ? ` 〜${s.dueTime.slice(0, 5)}` : ""}
                        </Badge>
                      ))}
                      <Badge tone="neutral">
                        {PHOTO_REQUIREMENT_LABELS[m.photoRequirement]}
                      </Badge>
                      {m.estimatedMinutes != null ? (
                        <Badge tone="neutral">{formatWorkload(m.estimatedMinutes)}</Badge>
                      ) : null}
                    </div>
                  </div>
                  <MasterRowActions id={m.id} active={m.active} name={m.name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-400">
        頻度の種類: {Object.values(FREQUENCY_LABELS).join(" / ")}
      </p>
    </div>
  );
}
