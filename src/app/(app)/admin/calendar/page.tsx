import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { getStatTasks } from "@/lib/data/stats-data";
import { endOfMonth, formatMonthJp, jstDateString, shiftMonth } from "@/lib/date/jst";
import { overallCompletion } from "@/lib/cleaning/stats";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonthCalendarGrid } from "@/components/calendar/MonthCalendarGrid";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const { month: monthRaw } = await searchParams;
  const today = jstDateString();
  const month =
    monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : today.slice(0, 7);

  const first = `${month}-01`;
  const last = endOfMonth(first);
  const tasks = await getStatTasks(first, last);
  const monthC = overallCompletion(tasks);

  return (
    <div className="space-y-4">
      <PageHeader
        title="清掃カレンダー"
        description={`${formatMonthJp(first)} ／ 予定 ${monthC.planned}・完了 ${monthC.done}（${monthC.rate}%）`}
      />

      <div className="flex items-center justify-between">
        <Link
          href={`/admin/calendar?month=${shiftMonth(month, -1)}`}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-600"
        >
          ← 前月
        </Link>
        <Link
          href="/admin/calendar"
          className="text-sm font-bold text-slate-500 hover:underline"
        >
          今月
        </Link>
        <Link
          href={`/admin/calendar?month=${shiftMonth(month, 1)}`}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-600"
        >
          翌月 →
        </Link>
      </div>

      <MonthCalendarGrid
        month={month}
        tasks={tasks}
        today={today}
        dateHref={(date) => `/admin/calendar/${date}`}
      />

      <p className="text-xs text-slate-400">
        日付をタップするとその日の清掃履歴を確認できます。未来日は生成前のため 0 件表示になります。
      </p>
    </div>
  );
}
