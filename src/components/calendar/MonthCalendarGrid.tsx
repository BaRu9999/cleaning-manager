import Link from "next/link";
import { dayOfWeek, daysInMonth } from "@/lib/date/jst";
import { overallCompletion, type StatTask } from "@/lib/cleaning/stats";
import { WEEKDAY_LABELS } from "@/config/constants";
import { cn } from "@/lib/cn";

/**
 * 月間カレンダーグリッド（`/admin/calendar` と `/reports` で共用）。
 * 日付セルのリンク先だけ呼び出し側が決める（`dateHref`）。
 */
export function MonthCalendarGrid({
  month,
  tasks,
  today,
  dateHref,
}: {
  /** `YYYY-MM` */
  month: string;
  tasks: StatTask[];
  today: string;
  dateHref: (date: string) => string;
}) {
  const first = `${month}-01`;
  const byDate = new Map<string, StatTask[]>();
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

  return (
    <div>
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
              href={dateHref(date)}
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
    </div>
  );
}
