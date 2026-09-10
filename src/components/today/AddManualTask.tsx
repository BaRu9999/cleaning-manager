"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  TIME_SLOTS,
  TIME_SLOT_LABELS,
  type TimeSlotKey,
} from "@/config/constants";
import { createManualTaskAction } from "@/lib/data/task-actions";
import { jstDateString } from "@/lib/date/jst";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";

export function AddManualTask({
  masters,
  users,
}: {
  masters: { id: string; name: string }[];
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [masterId, setMasterId] = useState("");
  const [taskDate, setTaskDate] = useState(jstDateString());
  const [timeSlot, setTimeSlot] = useState<TimeSlotKey>("open_hours");
  const [assigneeId, setAssigneeId] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap w-full rounded-lg border border-dashed border-slate-300 py-2.5 text-sm font-bold text-slate-500"
      >
        ＋ 臨時の清掃を追加（手動）
      </button>
    );
  }

  function submit() {
    setError(null);
    if (!masterId) {
      setError("清掃項目を選択してください");
      return;
    }
    startTransition(async () => {
      const res = await createManualTaskAction({
        masterId,
        taskDate,
        timeSlot,
        assigneeId: assigneeId || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setOpen(false);
        setMasterId("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
      <p className="text-sm font-bold text-slate-700">臨時の清掃を追加</p>
      <Field label="清掃項目" required>
        <Select value={masterId} onChange={(e) => setMasterId(e.target.value)}>
          <option value="">選択してください</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="日付">
          <TextInput
            type="date"
            value={taskDate}
            onChange={(e) => setTaskDate(e.target.value)}
          />
        </Field>
        <Field label="時間帯">
          <Select
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value as TimeSlotKey)}
          >
            {TIME_SLOTS.map((s) => (
              <option key={s} value={s}>
                {TIME_SLOT_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="担当スタッフ（任意）">
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">項目の既定に従う</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          閉じる
        </Button>
        <Button className="flex-1" onClick={submit} disabled={pending}>
          {pending ? "追加中…" : "追加する"}
        </Button>
      </div>
    </div>
  );
}
