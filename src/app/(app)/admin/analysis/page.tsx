import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { getStatTasks } from "@/lib/data/stats-data";
import { addDays, jstDateString } from "@/lib/date/jst";
import {
  completionByArea,
  completionByCategory,
  missRanking,
  overallCompletion,
} from "@/lib/cleaning/stats";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { MiniBar } from "@/components/ui/ProgressBar";

export const dynamic = "force-dynamic";

const RANGES = [30, 60, 90, 180];

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const { days: daysRaw } = await searchParams;
  const days = RANGES.includes(Number(daysRaw)) ? Number(daysRaw) : 90;

  const today = jstDateString();
  const from = addDays(today, -(days - 1));
  const tasks = await getStatTasks(from, today);

  const overall = overallCompletion(tasks);
  const ranking = missRanking(tasks, { minPlanned: 3 });
  const byArea = completionByArea(tasks);
  const byCategory = completionByCategory(tasks);

  return (
    <div className="space-y-4">
      <PageHeader
        title="清掃漏れ分析"
        description={`直近 ${days} 日（${from} 〜 ${today}）／ 全体完了率 ${overall.rate}%・未実施 ${overall.missed} 件`}
        action={
          <Link
            href="/admin/analysis/time"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700"
          >
            実績時間分析 →
          </Link>
        }
      />

      <div className="flex gap-2">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/admin/analysis?days=${d}`}
            className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
              d === days
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {d}日
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader
          title="未実施率ランキング"
          subtitle="よく忘れられている清掃（母数3件以上・未実施＝期限超過/未着手）"
        />
        <CardBody>
          {ranking.length === 0 ? (
            <EmptyState title="未実施の清掃はありません" description="この期間は漏れが検出されませんでした。" />
          ) : (
            <ol className="space-y-2">
              {ranking.map((r, i) => (
                <li
                  key={r.masterId ?? r.masterName}
                  className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-0"
                >
                  <span className="w-6 text-center text-lg font-bold text-slate-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-800">
                      {r.masterName}
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-red-500"
                        style={{ width: `${r.missRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-lg font-bold text-red-600">
                      {r.missRate}%
                    </div>
                    <div className="tabular text-[11px] text-slate-400">
                      {r.missed}/{r.planned}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="場所別 完了率" subtitle="低い順" />
          <CardBody className="space-y-1.5">
            {byArea.length === 0 ? (
              <p className="text-sm text-slate-400">データなし</p>
            ) : (
              byArea.map((a) => (
                <MiniBar
                  key={a.key}
                  label={a.label}
                  value={a.rate}
                  max={100}
                  suffix="%"
                  tone={a.rate >= 90 ? "bg-emerald-500" : a.rate >= 70 ? "bg-amber-500" : "bg-red-500"}
                />
              ))
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="カテゴリー別 完了率" subtitle="低い順" />
          <CardBody className="space-y-1.5">
            {byCategory.length === 0 ? (
              <p className="text-sm text-slate-400">データなし</p>
            ) : (
              byCategory.map((c) => (
                <MiniBar
                  key={c.key}
                  label={c.label}
                  value={c.rate}
                  max={100}
                  suffix="%"
                  tone={c.rate >= 90 ? "bg-emerald-500" : c.rate >= 70 ? "bg-amber-500" : "bg-red-500"}
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
