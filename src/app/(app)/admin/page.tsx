import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { WEEKDAY_LABELS } from "@/config/constants";
import { getStatTasks, startOfWeekMon } from "@/lib/data/stats-data";
import { getTasksForDate } from "@/lib/data/tasks";
import { getEquipmentIssueOpenCount } from "@/lib/data/equipment-issues";
import { formatLongJp, jstDateString, startOfMonth } from "@/lib/date/jst";
import {
  completionByArea,
  implementationByStaff,
  missRanking,
  missedByWeekday,
  overallCompletion,
} from "@/lib/cleaning/stats";
import { computeStaffWorkload } from "@/lib/cleaning/workload";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { MiniBar } from "@/components/ui/ProgressBar";
import { RegenerateButton } from "@/components/today/RegenerateButton";

export const dynamic = "force-dynamic";

function rateTone(rate: number) {
  return rate >= 90 ? "good" : rate >= 70 ? "warning" : "danger";
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const today = jstDateString();
  const weekStart = startOfWeekMon(today);
  const monthStart = startOfMonth(today);
  const rangeFrom = weekStart < monthStart ? weekStart : monthStart;

  const [tasks, todayFullTasks, equipmentOpenCount] = await Promise.all([
    getStatTasks(rangeFrom, today),
    getTasksForDate(today),
    getEquipmentIssueOpenCount(),
  ]);
  const todayTasks = tasks.filter((t) => t.taskDate === today);
  const weekTasks = tasks.filter((t) => t.taskDate >= weekStart);
  const monthTasks = tasks.filter((t) => t.taskDate >= monthStart);

  const todayC = overallCompletion(todayTasks);
  const weekC = overallCompletion(weekTasks);
  const monthC = overallCompletion(monthTasks);

  const todayPending = todayTasks.filter((t) => t.status === "pending").length;
  const todayOverdue = todayTasks.filter((t) => t.status === "overdue").length;
  const todayInProgress = todayFullTasks.filter((t) => t.status === "in_progress").length;
  const plannedMinutes = todayFullTasks
    .filter((t) => t.status !== "skipped")
    .reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
  const doneActualMinutes = todayFullTasks
    .filter((t) => t.status === "done")
    .reduce((s, t) => s + (t.actualMinutes ?? 0), 0);
  const carriedOverToday = todayFullTasks.filter((t) => t.originTaskId).length;
  const todayWorkload = computeStaffWorkload(
    todayFullTasks.map((t) => ({
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeName,
      estimatedMinutes: t.estimatedMinutes,
      status: t.status,
    })),
  );
  const maxWorkloadMinutes = Math.max(1, ...todayWorkload.map((w) => w.totalMinutes));

  const byArea = completionByArea(monthTasks).slice(0, 10);
  const byStaff = implementationByStaff(monthTasks).slice(0, 10);
  const byWeekday = missedByWeekday(monthTasks);
  const maxStaff = Math.max(1, ...byStaff.map((s) => s.done));
  const maxMissedWd = Math.max(1, ...byWeekday.map((w) => w.missed));
  const ranking = missRanking(monthTasks, { minPlanned: 3 }).slice(0, 5);

  return (
    <div className="space-y-4">
      <PageHeader
        title="管理ダッシュボード"
        description={`${formatLongJp(today)} 時点。今週 ${weekStart}〜 / 今月 ${monthStart}〜`}
        action={<RegenerateButton label="本日分を生成" />}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="今日の完了率" value={todayC.rate} unit="%" tone={rateTone(todayC.rate)} emphasis sub={`${todayC.done}/${todayC.planned}`} />
        <Stat label="今週の完了率" value={weekC.rate} unit="%" tone={rateTone(weekC.rate)} sub={`${weekC.done}/${weekC.planned}`} />
        <Stat label="今月の完了率" value={monthC.rate} unit="%" tone={rateTone(monthC.rate)} sub={`${monthC.done}/${monthC.planned}`} />
        <Stat label="本日の未実施" value={todayPending} unit="件" tone={todayPending > 0 ? "warning" : "good"} />
        <Stat label="本日の期限超過" value={todayOverdue} unit="件" tone={todayOverdue > 0 ? "danger" : "good"} />
        <Stat label="今月の未実施" value={monthC.missed} unit="件" tone={monthC.missed > 0 ? "warning" : "good"} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="本日 実施中" value={todayInProgress} unit="件" />
        <Stat label="予定清掃時間" value={plannedMinutes} unit="分" />
        <Stat label="完了済実績時間" value={doneActualMinutes} unit="分" tone="info" />
        <Stat
          label="設備異常"
          value={equipmentOpenCount}
          unit="件"
          tone={equipmentOpenCount > 0 ? "danger" : "good"}
          sub="未対応"
        />
      </div>
      {carriedOverToday > 0 ? (
        <Link
          href="/today"
          className="block rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800"
        >
          繰越清掃 {carriedOverToday}件（前日実施不可分）
        </Link>
      ) : null}

      <Card>
        <CardHeader
          title="本日のスタッフ負荷"
          subtitle="推定作業時間の合計。偏りがあれば「出勤・清掃割当」で調整できます。"
          action={
            <Link href="/admin/assignments" className="text-xs font-bold text-slate-500 hover:underline">
              出勤・割当 →
            </Link>
          }
        />
        <CardBody className="space-y-1.5">
          {todayWorkload.length === 0 ? (
            <p className="text-sm text-slate-400">本日の担当割当がまだありません。</p>
          ) : (
            todayWorkload.map((w) => (
              <MiniBar
                key={w.staffId}
                label={`${w.staffName}（${w.count}件）`}
                value={w.totalMinutes}
                max={maxWorkloadMinutes}
                suffix="分"
              />
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="清掃漏れ分析（今月）"
          subtitle="よく忘れられている清掃 上位5件"
          action={
            <Link href="/admin/analysis" className="text-xs font-bold text-slate-500 hover:underline">
              詳細 →
            </Link>
          }
        />
        <CardBody>
          {ranking.length === 0 ? (
            <p className="text-sm text-slate-400">対象データがまだありません。</p>
          ) : (
            <ol className="space-y-1.5">
              {ranking.map((r, i) => (
                <li key={r.masterId ?? r.masterName} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-right font-bold text-slate-400">{i + 1}</span>
                  <span className="flex-1 truncate">{r.masterName}</span>
                  <span className="tabular font-bold text-red-600">未実施 {r.missRate}%</span>
                  <span className="tabular text-xs text-slate-400">
                    ({r.missed}/{r.planned})
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="清掃場所別 完了率（今月）" subtitle="低い順" />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="スタッフ別 実施数（今月）" />
          <CardBody className="space-y-1.5">
            {byStaff.length === 0 ? (
              <p className="text-sm text-slate-400">データなし</p>
            ) : (
              byStaff.map((s) => (
                <MiniBar key={s.id} label={s.name} value={s.done} max={maxStaff} suffix="件" />
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="曜日別 未実施件数（今月）" />
          <CardBody className="space-y-1.5">
            {byWeekday.map((w) => (
              <MiniBar
                key={w.weekday}
                label={`${WEEKDAY_LABELS[w.weekday]}曜`}
                value={w.missed}
                max={maxMissedWd}
                suffix="件"
                tone="bg-red-400"
              />
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
