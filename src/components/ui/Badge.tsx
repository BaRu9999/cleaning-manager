import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Priority, TaskStatus } from "@/config/constants";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/config/constants";

type Tone =
  | "neutral"
  | "pending"
  | "in_progress"
  | "done"
  | "overdue"
  | "skipped"
  | "info"
  | "high";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-slate-100 text-slate-700 border-slate-300",
  in_progress: "bg-sky-50 text-sky-700 border-sky-300",
  done: "bg-emerald-50 text-emerald-700 border-emerald-300",
  overdue: "bg-red-50 text-red-700 border-red-300",
  skipped: "bg-slate-100 text-slate-400 border-slate-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
  high: "bg-amber-50 text-amber-800 border-amber-300",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={status}>{TASK_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal") return null;
  return (
    <Badge tone={priority === "high" ? "high" : "neutral"}>
      優先度{PRIORITY_LABELS[priority]}
    </Badge>
  );
}
