import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { getTimingRecords } from "@/lib/data/time-analysis-data";
import { addDays, jstDateString } from "@/lib/date/jst";
import {
  analyzeItemTimings,
  analyzeOverallTiming,
  analyzeStaffTiming,
  overrunRanking,
} from "@/lib/cleaning/time-analysis";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { MiniBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TimeAnalysisTable } from "@/components/admin/TimeAnalysisTable";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

export default async function TimeAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const { days: daysRaw } = await searchParams;
  const days = RANGES.includes(Number(daysRaw)) ? Number(daysRaw) : 30;

  const today = jstDateString();
  const from = addDays(today, -(days - 1));
  const records = await getTimingRecords(from, today);

  const overall = analyzeOverallTiming(records);
  const items = analyzeItemTimings(records);
  const staffRows = analyzeStaffTiming(records);
  const ranking = overrunRanking(items, 10);
  const maxStaffAvg = Math.max(1, ...staffRows.map((s) => s.avgActual));

  return (
    <div className="space-y-4">
      <PageHeader
        title="実績時間分析"
        description={`直近 ${days} 日（${from} 〜 ${today}）の完了実績。予想時間と実際にかかった時間から、より正確な所要時間目安を見つけます。`}
        back={{ href: "/admin/analysis", label: "清掃漏れ分析" }}
      />

      <div className="flex gap-2">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/admin/analysis/time?days=${d}`}
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

      {records.length === 0 ? (
        <EmptyState
          title="この期間の完了実績がありません"
          description="スタッフが清掃を完了すると（実際にかかった時間つきで）ここに集計されます。"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="平均推定時間" value={overall.avgEstimated ?? "—"} unit={overall.avgEstimated != null ? "分" : ""} />
            <Stat label="平均実績時間" value={overall.avgActual} unit="分" emphasis />
            <Stat
              label="推定との差"
              value={overall.diffMinutes != null ? (overall.diffMinutes > 0 ? `+${overall.diffMinutes}` : overall.diffMinutes) : "—"}
              unit={overall.diffMinutes != null ? "分" : ""}
              tone={overall.diffMinutes != null && overall.diffMinutes > 0 ? "warning" : "neutral"}
            />
            <Stat
              label="時間超過率"
              value={overall.overrunRatePct}
              unit="%"
              tone={overall.overrunRatePct >= 50 ? "danger" : "neutral"}
            />
          </div>

          <Card>
            <CardHeader title="時間超過ランキング" subtitle="設定時間に対して実績が大きく上回っている項目（サンプル3件以上）" />
            <CardBody>
              {ranking.length === 0 ? (
                <p className="text-sm text-slate-400">大きな超過は見つかりませんでした。</p>
              ) : (
                <ol className="space-y-1.5">
                  {ranking.map((r, i) => (
                    <li key={r.masterId ?? r.masterName} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-right font-bold text-slate-400">{i + 1}</span>
                      <span className="flex-1 truncate">{r.masterName}</span>
                      <span className="tabular font-bold text-red-600">+{r.diffPct}%</span>
                      <span className="tabular text-xs text-slate-400">
                        ({r.currentEstimate ?? "未設定"}→{r.medianActual}分)
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="清掃項目別 平均・中央値・推奨時間"
              subtitle="推奨は設定時間と実績中央値の差が20%以上のときのみ表示（適用は手動）"
            />
            <CardBody>
              <TimeAnalysisTable items={items} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="スタッフ別 平均作業時間" />
            <CardBody className="space-y-1.5">
              {staffRows.length === 0 ? (
                <p className="text-sm text-slate-400">データなし</p>
              ) : (
                staffRows.map((s) => (
                  <MiniBar key={s.staffId} label={s.staffName} value={s.avgActual} max={maxStaffAvg} suffix="分" />
                ))
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
