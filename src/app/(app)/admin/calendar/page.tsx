import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { getStatTasks } from "@/lib/data/stats-data";
import {
  dayOfWeek,
  daysInMonth,
  endOfMonth,
  formatMonthJp,
  jstDateString,
} from "@/lib/date/jst";
import { overallCompletion } from "@/lib/cleaning/stats";
import { PageHeader } from "@/components/layout/PageHeader";
import { WEEKDAY_LABELS } from "@/config/constants";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map((n) => Number.parseInt(n, 10));
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

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

  const byDate = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const arr = byDate.get(t.taskDate) ?? [];
    arr.push(t);
    byDate.set(t.taskDate, arr);
  }

  const total = daysInMonth(first);
  const leading = dayOfWeek(first); // 0=日
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthTasks = tasks;
  const monthC = overallCompletion(monthTasks);

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

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={w} className={cn(i === 0 && "text-red-400", i === 6 && "text-sky-400")}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="aspect-square rounded-lg bg-transparent" />;
          const dTasks = byDate.get(date) ?? [];
          const c = overallCompletion(dTasks);
          const isToday = date === today;
          const missed = c.missed;
          const tone =
            dTasks.length === 0
              ? "bg-white border-slate-100 text-slate-300"
              : missed > 0
                ? "bg-red-50 border-red-200"
                : c.rate >= 100
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-amber-50 border-amber-200";
          return (
            <Link
              key={date}
              href={`/admin/calendar/${date}`}
              className={cn(
                "aspect-square rounded-lg border p-1 text-left",
                tone,
                isToday && "ring-2 ring-slate-900",
              )}
            >
              <div className="text-xs font-bold text-slate-500">{Number(date.slice(8, 10))}</div>
              {dTasks.length > 0 ? (
                <div className="mt-0.5 leading-tight">
                  <div className="tabular text-[13px] font-bold text-slate-800">
                    {dTasks.length}件
                  </div>
                  <div className="text-[10px] text-emerald-600">完{c.done}</div>
                  {missed > 0 ? (
                    <div className="text-[10px] font-bold text-red-600">未{missed}</div>
                  ) : null}
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">
        日付をタップするとその日の清掃履歴を確認できます。未来日は生成前のため 0 件表示になります。
      </p>
    </div>
  );
}
