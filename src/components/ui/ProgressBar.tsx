import { cn } from "@/lib/cn";

/** 本日の進捗など。0-100 の完了率を大きく見せる。 */
export function ProgressBar({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const tone =
    pct >= 100
      ? "bg-emerald-500"
      : pct >= 70
        ? "bg-sky-500"
        : pct >= 40
          ? "bg-amber-500"
          : "bg-red-500";

  return (
    <div className={className}>
      <div className="flex items-end justify-between">
        <span className="tabular text-3xl font-bold text-slate-900">
          {done}
          <span className="text-lg text-slate-400"> / {total}</span>
        </span>
        <span className="tabular text-2xl font-bold text-slate-700">{pct}%</span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** 場所別・スタッフ別などの横棒（ラベル + 値） */
export function MiniBar({
  label,
  value,
  max,
  suffix = "",
  tone = "bg-slate-800",
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  tone?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 shrink-0 truncate text-slate-600">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular w-14 shrink-0 text-right font-bold text-slate-800">
        {value}
        {suffix}
      </span>
    </div>
  );
}
