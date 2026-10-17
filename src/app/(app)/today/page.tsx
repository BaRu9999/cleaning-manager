import Link from "next/link";
import { requireMember } from "@/lib/auth/guard";
import { getTodayTasks } from "@/lib/data/tasks";
import { listAssignableUsers, listMasters } from "@/lib/data/masters";
import { getStoreSettings } from "@/lib/data/settings";
import { formatLongJp } from "@/lib/date/jst";
import { summarizeProgress } from "@/lib/cleaning/progress";
import { groupBySlot, slotLabel } from "@/lib/cleaning/slots";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TodaySummary } from "@/components/today/TodaySummary";
import { TaskCard, type TaskCardData } from "@/components/today/TaskCard";
import { RegenerateButton } from "@/components/today/RegenerateButton";
import { AddManualTask } from "@/components/today/AddManualTask";

export const dynamic = "force-dynamic";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const me = await requireMember();
  const { mine } = await searchParams;
  const onlyMine = mine === "1";

  const [{ date, tasks }, store, masters, users] = await Promise.all([
    getTodayTasks(),
    getStoreSettings(),
    me.role === "admin" ? listMasters() : Promise.resolve([]),
    me.role === "admin" ? listAssignableUsers() : Promise.resolve([]),
  ]);

  const visible = onlyMine
    ? tasks.filter((t) => t.assigneeId === me.id)
    : tasks;
  const summary = summarizeProgress(visible);
  const groups = groupBySlot(visible);
  const myCount = tasks.filter((t) => t.assigneeId === me.id).length;

  return (
    <div>
      <PageHeader title="今日の清掃" description={formatLongJp(date)} />

      <div className="mb-3 flex gap-2">
        <Link
          href="/today"
          className={`flex-1 rounded-lg border py-2 text-center text-sm font-bold ${
            onlyMine
              ? "border-slate-200 bg-white text-slate-500"
              : "border-slate-900 bg-slate-900 text-white"
          }`}
        >
          すべて（{tasks.length}）
        </Link>
        <Link
          href="/today?mine=1"
          className={`flex-1 rounded-lg border py-2 text-center text-sm font-bold ${
            onlyMine
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          自分の担当（{myCount}）
        </Link>
      </div>

      <TodaySummary summary={summary} />

      {visible.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={
              onlyMine
                ? "あなたの担当タスクはありません"
                : "本日の清掃タスクがありません"
            }
            description={
              me.role === "admin"
                ? "清掃項目マスタが未登録か、まだ生成されていません。下のボタンで生成できます（毎日 0:05 に自動生成）。"
                : "まだ生成されていない可能性があります。管理者にお問い合わせください。"
            }
            action={me.role === "admin" ? <RegenerateButton /> : undefined}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-bold text-slate-700">
                {slotLabel(g.key, store.timeSlots)}
                <span className="text-xs font-normal text-slate-400">
                  {g.items.filter((t) => t.status === "done").length}/{g.items.length}
                </span>
              </h2>
              <div className="space-y-2">
                {g.items.map((t) => (
                  <TaskCard key={t.id} task={toCardData(t)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {me.role === "admin" ? (
        <div className="mt-6 space-y-3">
          <AddManualTask
            masters={masters.map((m) => ({ id: m.id, name: m.name }))}
            users={users.map((u) => ({ id: u.id, name: u.displayName }))}
          />
          {visible.length > 0 ? (
            <div className="flex justify-center">
              <RegenerateButton label="不足分を生成（冪等）" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function toCardData(t: Awaited<ReturnType<typeof getTodayTasks>>["tasks"][number]): TaskCardData {
  return {
    id: t.id,
    masterName: t.masterName,
    areaLabel: t.areaLabel,
    categoryLabel: t.categoryLabel,
    position: t.position,
    assigneeName: t.assigneeName,
    status: t.status,
    dueAt: t.dueAt,
    fixedTime: t.fixedTime,
    estimatedMinutes: t.estimatedMinutes,
    priority: t.priority,
    photoRequirement: t.photoRequirement,
    photoCount: t.photoCount,
    completedAt: t.completedAt,
    completedByName: t.completedByName,
    originTaskId: t.originTaskId,
  };
}
