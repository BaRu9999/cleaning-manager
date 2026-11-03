import { requireReportViewer } from "@/lib/auth/guard";
import { getStatTasks } from "@/lib/data/stats-data";
import { jstDateString } from "@/lib/date/jst";
import { overallCompletion } from "@/lib/cleaning/stats";
import { getMonthRange, getWeekRange } from "@/lib/reports/period";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";

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
        </CardBody>
      </Card>

      <p className="text-xs text-slate-400">
        PDFには完了率、清掃が行き届いていない場所（完了率が低い順）、よく忘れられる清掃項目、曜日別の予定・未実施件数、スタッフ別の完了登録数が含まれます。
      </p>
    </div>
  );
}
