import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { getHistory } from "@/lib/data/tasks";
import { formatLongJp, formatInstantJst } from "@/lib/date/jst";
import { summarizeProgress } from "@/lib/cleaning/progress";
import { groupBySlot, slotLabel } from "@/lib/cleaning/slots";
import { getStoreSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { TodaySummary } from "@/components/today/TodaySummary";

export const dynamic = "force-dynamic";

export default async function CalendarDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await requireAdmin();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const [tasks, store] = await Promise.all([
    getHistory({ from: date, to: date, limit: 500 }),
    getStoreSettings(),
  ]);
  const summary = summarizeProgress(tasks);
  const groups = groupBySlot(tasks);

  return (
    <div className="space-y-4">
      <PageHeader
        title={formatLongJp(date)}
        back={{ href: `/admin/calendar?month=${date.slice(0, 7)}`, label: "カレンダー" }}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="この日の清掃タスクはありません"
          description="未来日、または生成前です。"
        />
      ) : (
        <>
          <TodaySummary summary={summary} title="この日の実施状況" />
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-sm font-bold text-slate-700">
                {slotLabel(g.key, store.timeSlots)}
              </h2>
              <ul className="space-y-1.5">
                {g.items.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/today/${t.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800">{t.masterName}</span>
                        <div className="text-xs text-slate-500">
                          {t.completedByName
                            ? `${formatInstantJst(t.completedAt)} ${t.completedByName}`
                            : t.areaLabel || t.categoryLabel || ""}
                          {t.comment ? ` ・ 💬${t.comment}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {t.photoCount > 0 ? (
                          <span className="text-[11px] text-slate-400">📷{t.photoCount}</span>
                        ) : null}
                        <StatusBadge status={t.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
