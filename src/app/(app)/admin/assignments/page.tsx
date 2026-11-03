import { requireAdmin } from "@/lib/auth/guard";
import { getTasksForDate } from "@/lib/data/tasks";
import { getDailyStaffing } from "@/lib/data/staffing";
import { listAssignableUsers } from "@/lib/data/masters";
import { getStoreSettings } from "@/lib/data/settings";
import { formatLongJp, formatTimeJst, jstDateString, trimSeconds } from "@/lib/date/jst";
import { slotLabel } from "@/lib/cleaning/slots";
import { PageHeader } from "@/components/layout/PageHeader";
import { StaffingEditor } from "@/components/admin/StaffingEditor";
import { AssignmentBoard, type AssignmentTask } from "@/components/admin/AssignmentBoard";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const { date: dateRaw } = await searchParams;
  const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : jstDateString();

  const [tasks, staffing, allStaff, store] = await Promise.all([
    getTasksForDate(date),
    getDailyStaffing(date),
    listAssignableUsers(),
    getStoreSettings(),
  ]);

  const assignmentTasks: AssignmentTask[] = tasks.map((t) => ({
    id: t.id,
    masterName: t.masterName,
    areaLabel: t.areaLabel,
    slotLabel: slotLabel(t.timeSlot, store.timeSlots),
    dueLabel: t.fixedTime ? trimSeconds(t.fixedTime) : formatTimeJst(t.dueAt),
    estimatedMinutes: t.estimatedMinutes,
    priority: t.priority,
    status: t.status,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeName,
    assignmentLocked: t.assignmentLocked,
    position: t.position,
  }));

  const availableToday = staffing.filter((s) => s.availableForCleaning);

  return (
    <div className="space-y-4">
      <PageHeader
        title="出勤・清掃割当"
        description={`${formatLongJp(date)} ／ 出勤者から清掃を自動割当します。`}
      />

      <StaffingEditor
        workDate={date}
        staffOptions={allStaff.map((u) => ({ id: u.id, displayName: u.displayName, position: u.position }))}
        initial={staffing.map((s) => ({
          userId: s.userId,
          positions: s.positions,
          startTime: s.startTime,
          endTime: s.endTime,
          availableForCleaning: s.availableForCleaning,
        }))}
        positions={store.positions}
      />

      <AssignmentBoard
        date={date}
        tasks={assignmentTasks}
        staffOptions={availableToday.map((s) => ({ id: s.userId, name: s.userName }))}
      />
    </div>
  );
}
