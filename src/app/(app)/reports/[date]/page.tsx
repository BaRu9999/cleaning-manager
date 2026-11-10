import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReportViewer } from "@/lib/auth/guard";
import { getHistory, getPhotosForTasks } from "@/lib/data/tasks";
import { formatLongJp, formatInstantJst } from "@/lib/date/jst";
import { summarizeProgress } from "@/lib/cleaning/progress";
import { groupBySlot, slotLabel } from "@/lib/cleaning/slots";
import { getStoreSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { TodaySummary } from "@/components/today/TodaySummary";

export const dynamic = "force-dynamic";

export default async function ReportDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await requireReportViewer();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const [tasks, store] = await Promise.all([
    getHistory({ from: date, to: date, limit: 500 }),
    getStoreSettings(),
  ]);
  const photosByTask = await getPhotosForTasks(tasks.map((t) => t.id));
  const summary = summarizeProgress(tasks);
  const groups = groupBySlot(tasks);

  return (
    <div className="space-y-4">
      <PageHeader title={formatLongJp(date)} back={{ href: "/reports", label: "完了レポート" }} />

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
                {g.items.map((t) => {
                  const photos = photosByTask.get(t.id) ?? [];
                  return (
                    <li
                      key={t.id}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/today/${t.id}`}
                            className="font-bold text-slate-800 hover:underline"
                          >
                            {t.masterName}
                          </Link>
                          <div className="text-xs text-slate-500">
                            {t.completedByName
                              ? `${formatInstantJst(t.completedAt)} ${t.completedByName}`
                              : t.areaLabel || t.categoryLabel || ""}
                            {t.comment ? ` ・ 💬${t.comment}` : ""}
                          </div>
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                      {photos.length > 0 ? (
                        <div className="mt-2 flex gap-1.5 overflow-x-auto">
                          {photos.map((p) => (
                            <a
                              key={p.id}
                              href={p.signedUrl ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                            >
                              {p.signedUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.signedUrl}
                                  alt="清掃写真"
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
