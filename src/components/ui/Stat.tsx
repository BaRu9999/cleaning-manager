import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "good" | "warning" | "danger" | "info";

const VALUE_TONE: Record<Tone, string> = {
  neutral: "text-slate-900",
  good: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  info: "text-sky-700",
};

/** KPI カード。数字を大きく1目で。 */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: Tone;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3 shadow-sm",
        emphasis ? "border-slate-300" : "border-slate-200",
      )}
    >
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div
        className={cn(
          "tabular mt-1 font-bold leading-tight",
          emphasis ? "text-3xl" : "text-2xl",
          VALUE_TONE[tone],
        )}
      >
        {value}
        {unit ? (
          <span className="ml-0.5 text-sm font-semibold text-slate-400">
            {unit}
          </span>
        ) : null}
      </div>
      {sub ? (
        <div className="tabular mt-1 text-xs text-slate-500">{sub}</div>
      ) : null}
    </div>
  );
}
