import { cn } from "@/lib/cn";
import type { ProgressSummary } from "@/lib/cleaning/progress";
import { ProgressBar } from "@/components/ui/ProgressBar";

const CARDS: {
  key: keyof Pick<ProgressSummary, "pending" | "inProgress" | "done" | "overdue">;
  label: string;
  cls: string;
}[] = [
  { key: "pending", label: "未実施", cls: "bg-slate-100 text-slate-700" },
  { key: "inProgress", label: "実施中", cls: "bg-sky-100 text-sky-800" },
  { key: "done", label: "完了", cls: "bg-emerald-100 text-emerald-800" },
  { key: "overdue", label: "期限超過", cls: "bg-red-100 text-red-800" },
];

export function TodaySummary({
  summary,
  title = "本日の進捗",
}: {
  summary: ProgressSummary;
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-bold text-slate-600">{title}</div>
      <ProgressBar done={summary.done} total={summary.planned} />
      <div className="mt-3 grid grid-cols-4 gap-2">
        {CARDS.map((c) => (
          <div
            key={c.key}
            className={cn("rounded-lg px-2 py-2 text-center", c.cls)}
          >
            <div className="tabular text-2xl font-bold leading-none">
              {summary[c.key]}
            </div>
            <div className="mt-1 text-[11px] font-bold">{c.label}</div>
          </div>
        ))}
      </div>
      {summary.skipped > 0 ? (
        <div className="mt-2 text-right text-xs text-slate-400">
          スキップ {summary.skipped} 件
        </div>
      ) : null}
    </div>
  );
}
