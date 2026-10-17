import { formatInstantJst } from "@/lib/date/jst";
import type { CleaningLog, LogAction } from "@/lib/types/domain";

const ACTION_LABELS: Record<LogAction, string> = {
  generate: "生成",
  start: "開始",
  complete: "完了",
  skip: "スキップ",
  reopen: "再開",
  uncomplete: "完了取消",
  carry_over: "翌日へ繰越",
};

export function LogTimeline({ logs }: { logs: CleaningLog[] }) {
  if (logs.length === 0) {
    return <p className="text-xs text-slate-400">操作履歴はありません</p>;
  }
  return (
    <ol className="space-y-2">
      {logs.map((l) => (
        <li key={l.id} className="flex gap-2 text-xs">
          <span className="tabular w-20 shrink-0 text-slate-400">
            {formatInstantJst(l.createdAt)}
          </span>
          <span className="font-bold text-slate-700">{ACTION_LABELS[l.action]}</span>
          <span className="text-slate-500">
            {l.actorName ?? "システム"}
            {l.actualMinutes != null ? ` ・ ${l.actualMinutes}分` : ""}
            {l.comment ? ` ・ ${l.comment}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
