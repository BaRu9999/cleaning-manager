import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/guard";
import { getTask, getTaskLogs, getTaskPhotos } from "@/lib/data/tasks";
import { getMaster } from "@/lib/data/masters";
import { getStoreSettings } from "@/lib/data/settings";
import { PHOTO_REQUIREMENT_LABELS, PRIORITY_LABELS } from "@/config/constants";
import { formatLongJp, formatInstantJst } from "@/lib/date/jst";
import { slotLabel } from "@/lib/cleaning/slots";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { CompleteForm } from "@/components/today/CompleteForm";
import { AdminTaskControls } from "@/components/today/AdminTaskControls";
import { LogTimeline } from "@/components/today/LogTimeline";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const me = await requireMember();
  const { taskId } = await params;

  const task = await getTask(taskId);
  if (!task) notFound();

  const [photos, logs, store, master] = await Promise.all([
    getTaskPhotos(taskId),
    getTaskLogs(taskId),
    getStoreSettings(),
    task.masterId ? getMaster(task.masterId) : Promise.resolve(null),
  ]);

  const rows: [string, string | null][] = [
    ["日付", formatLongJp(task.taskDate)],
    ["場所", task.areaLabel || task.categoryLabel || "—"],
    ["時間帯", slotLabel(task.timeSlot, store.timeSlots)],
    [
      "期限",
      task.fixedTime
        ? `${task.fixedTime.slice(0, 5)}`
        : formatInstantJst(task.dueAt) ?? "期限なし",
    ],
    ["担当", task.assigneeName || task.position || "指定なし"],
    ["所要時間の目安", task.estimatedMinutes != null ? `${task.estimatedMinutes}分` : "—"],
    ["優先度", PRIORITY_LABELS[task.priority]],
    ["写真", PHOTO_REQUIREMENT_LABELS[task.photoRequirement]],
    task.source === "manual" ? ["種別", "手動追加"] : ["種別", "自動生成"],
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={task.masterName}
        back={{ href: "/today", label: "今日の清掃" }}
        action={<StatusBadge status={task.status} />}
      />

      <Card>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-bold text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
          {task.status === "done" ? (
            <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
              {formatInstantJst(task.completedAt)} に {task.completedByName ?? "?"} が完了
              {task.actualMinutes != null ? `（${task.actualMinutes}分）` : ""}
              {task.wasOverdue ? " ・ 期限超過後の完了" : ""}
              {task.comment ? ` / ${task.comment}` : ""}
            </p>
          ) : null}
          {task.status === "skipped" && task.skipReason ? (
            <p className="mt-3 rounded-lg bg-slate-100 p-2 text-xs text-slate-600">
              スキップ理由: {task.skipReason}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {master && (master.description || master.method || master.supplies || master.notes) ? (
        <Card>
          <CardHeader title="やり方" />
          <CardBody className="space-y-2 text-sm">
            {master.description ? (
              <p>
                <span className="font-bold text-slate-500">内容: </span>
                {master.description}
              </p>
            ) : null}
            {master.method ? (
              <p>
                <span className="font-bold text-slate-500">方法: </span>
                {master.method}
              </p>
            ) : null}
            {master.supplies ? (
              <p>
                <span className="font-bold text-slate-500">洗剤・備品: </span>
                {master.supplies}
              </p>
            ) : null}
            {master.notes ? (
              <p>
                <span className="font-bold text-slate-500">備考: </span>
                {master.notes}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <CompleteForm
        taskId={task.id}
        taskDate={task.taskDate}
        status={task.status}
        photoRequirement={task.photoRequirement}
        canOperate={true}
        initialPhotos={photos.map((p) => ({ id: p.id, signedUrl: p.signedUrl ?? null }))}
      />

      {me.role === "admin" ? (
        <AdminTaskControls taskId={task.id} status={task.status} />
      ) : null}

      <Card>
        <CardHeader title="操作履歴" />
        <CardBody>
          <LogTimeline logs={logs} />
        </CardBody>
      </Card>
    </div>
  );
}
