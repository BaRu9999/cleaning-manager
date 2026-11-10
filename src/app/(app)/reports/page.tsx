import Link from "next/link";
import { requireReportViewer } from "@/lib/auth/guard";
import { getStatTasks } from "@/lib/data/stats-data";
import { addDays, formatShortJp, jstDateString } from "@/lib/date/jst";
import { overallCompletion } from "@/lib/cleaning/stats";
import { getMonthRange, getWeekRange, type ReportPeriod } from "@/lib/reports/period";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { MonthCalendarGrid } from "@/components/calendar/MonthCalendarGrid";

function weekDates(week: ReportPeriod): string[] {
  const out: string[] = [];
  for (let d = week.from; d <= week.to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireReportViewer();

  const today = jstDateString();
  const week = getWeekRange(today);
  const month = getMonthRange(today);

  const [weekTasks, monthTasks] = await Promise.all([
    getStatTasks(week.from, week.to),
    getStatTasks(month.from, month.to),
  ]);
  const weekStats = overallCompletion(weekTasks);
  const monthStats = overallCompletion(monthTasks);

  return (
    <div className="space-y-4">
      <PageHeader
        title="完了レポート"
        description="週次・月次の完了実績、清掃が行き届いていない場所、曜日別の傾向をPDFで出力します。グループでの共有にご利用ください。"
      />

      <Alert tone="info">
        PDFをダウンロードし、普段お使いのグループ（LINE・チャット等）に添付して共有してください。
      </Alert>

      <Card>
        <CardHeader title="今週のレポート" subtitle={week.label} />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="予定" value={weekStats.planned} />
            <Stat label="完了" value={weekStats.done} />
            <Stat label="未実施" value={weekStats.missed} tone={weekStats.missed > 0 ? "warning" : "neutral"} />
            <Stat label="完了率" value={weekStats.rate} unit="%" emphasis />
          </div>
          <a
            href={`/api/reports/weekly?date=${today}`}
            className="tap inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            今週のレポートをPDFでダウンロード
          </a>
          <ul className="space-y-1.5">
            {weekDates(week).map((date) => {
              const dTasks = weekTasks.filter((t) => t.taskDate === date);
              const c = overallCompletion(dTasks);
              return (
                <li key={date}>
                  <Link
                    href={`/reports/${date}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
                  >
                    <span className="font-bold text-slate-700">{formatShortJp(date)}</span>
                    {dTasks.length > 0 ? (
                      <span className="tabular text-xs text-slate-500">
                        予定{c.planned}・完了{c.done}
                        {c.missed > 0 ? (
                          <span className="font-bold text-red-600"> ・未{c.missed}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">タスクなし</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="今月のレポート" subtitle={month.label} />
        <CardBody className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="予定" value={monthStats.planned} />
            <Stat label="完了" value={monthStats.done} />
            <Stat label="未実施" value={monthStats.missed} tone={monthStats.missed > 0 ? "warning" : "neutral"} />
            <Stat label="完了率" value={monthStats.rate} unit="%" emphasis />
          </div>
          <a
            href={`/api/reports/monthly?date=${today}`}
            className="tap inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            今月のレポートをPDFでダウンロード
          </a>
          <MonthCalendarGrid
            month={month.from.slice(0, 7)}
            tasks={monthTasks}
            today={today}
            dateHref={(date) => `/reports/${date}`}
          />
        </CardBody>
      </Card>

      <p className="text-xs text-slate-400">
        日付をタップすると、その日の清掃実施状況（完了・未実施・スキップ）とアップされた写真を確認できます。
      </p>
      <p className="text-xs text-slate-400">
        PDFには完了率、清掃が行き届いていない場所（完了率が低い順）、よく忘れられる清掃項目、曜日別の予定・未実施件数、スタッフ別の完了登録数が含まれます。
      </p>
    </div>
  );
}
