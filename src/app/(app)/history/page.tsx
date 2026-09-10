import Link from "next/link";
import { requireMember } from "@/lib/auth/guard";
import { getHistory, type HistoryFilters } from "@/lib/data/tasks";
import { listAreas, listAssignableUsers, listCategories, listMasters } from "@/lib/data/masters";
import { addDays, formatShortJp, formatInstantJst, jstDateString } from "@/lib/date/jst";
import { summarizeProgress } from "@/lib/cleaning/progress";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { HistoryFiltersBar } from "@/components/history/HistoryFiltersBar";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireMember();
  const sp = await searchParams;

  const today = jstDateString();
  const from = sp.from || addDays(today, -30);
  const to = sp.to || today;

  const filters: HistoryFilters = {
    from,
    to,
    completedById: sp.completedById || undefined,
    areaId: sp.areaId || undefined,
    categoryId: sp.categoryId || undefined,
    masterId: sp.masterId || undefined,
    status: (sp.status as HistoryFilters["status"]) || undefined,
    q: sp.q || undefined,
    limit: 400,
  };

  const [tasks, users, categories, areas, masters] = await Promise.all([
    getHistory(filters),
    listAssignableUsers(),
    listCategories({ includeInactive: true }),
    listAreas({ includeInactive: true }),
    listMasters({ includeInactive: true }),
  ]);

  const summary = summarizeProgress(tasks);

  return (
    <div className="space-y-4">
      <PageHeader
        title="清掃履歴"
        description={`${from} 〜 ${to} / ${tasks.length}件（完了 ${summary.done} ・ 未実施 ${summary.pending + summary.overdue} ・ スキップ ${summary.skipped}）`}
      />

      <HistoryFiltersBar
        options={{
          users: users.map((u) => ({ id: u.id, name: u.displayName })),
          categories: categories.map((c) => ({ id: c.id, name: c.name })),
          areas: areas.map((a) => ({ id: a.id, name: a.name, categoryId: a.categoryId })),
          masters: masters.map((m) => ({ id: m.id, name: m.name })),
        }}
        initial={{
          from,
          to,
          completedById: sp.completedById || "",
          categoryId: sp.categoryId || "",
          areaId: sp.areaId || "",
          masterId: sp.masterId || "",
          status: sp.status || "",
          q: sp.q || "",
        }}
      />

      {tasks.length === 0 ? (
        <EmptyState title="該当する履歴がありません" description="条件を変えて再検索してください。" />
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link
                href={`/today/${t.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="tabular text-xs font-bold text-slate-400">
                        {formatShortJp(t.taskDate)}
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {t.masterName}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {(t.categoryLabel || "未分類") +
                        (t.areaLabel ? ` / ${t.areaLabel}` : "")}
                      {t.status === "done" && t.completedByName
                        ? ` ・ ${formatInstantJst(t.completedAt)} ${t.completedByName}`
                        : ""}
                      {t.actualMinutes != null ? ` ・ ${t.actualMinutes}分` : ""}
                    </div>
                    {t.comment ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        💬 {t.comment}
                      </p>
                    ) : null}
                    {t.skipReason ? (
                      <p className="mt-1 text-xs text-slate-500">スキップ: {t.skipReason}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={t.status} />
                    {t.photoCount > 0 ? (
                      <span className="text-[11px] font-bold text-slate-500">
                        📷 {t.photoCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
