"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SKIP_REASON_CODES,
  SKIP_REASON_CODE_LABELS,
  type SkipReasonCode,
} from "@/config/constants";
import { skipTaskAction } from "@/lib/data/task-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox, Select, Textarea } from "@/components/ui/Field";

/** 実施不可の理由選択・翌日繰越チェック付きフォーム。管理者操作・スタッフ操作の両方から使う。 */
export function SkipTaskForm({
  taskId,
  onDone,
}: {
  taskId: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reasonCode, setReasonCode] = useState<SkipReasonCode>("busy");
  const [note, setNote] = useState("");
  const [carryOver, setCarryOver] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function submit() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await skipTaskAction(taskId, { reasonCode, note, carryOver });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data.carriedOver) setInfo("実施不可として記録し、翌日へ繰り越しました。");
      else if (res.data.note) setInfo(res.data.note);
      else setInfo("実施不可として記録しました。");
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <Select
        value={reasonCode}
        onChange={(e) => setReasonCode(e.target.value as SkipReasonCode)}
      >
        {SKIP_REASON_CODES.map((c) => (
          <option key={c} value={c}>
            {SKIP_REASON_CODE_LABELS[c]}
          </option>
        ))}
      </Select>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="補足（任意）"
        rows={2}
      />
      <Checkbox
        checked={carryOver}
        onChange={(e) => setCarryOver(e.target.checked)}
        label="翌日に繰り越す"
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}
      <Button size="sm" variant="danger" onClick={submit} disabled={pending}>
        {pending ? "処理中…" : "実施不可として記録"}
      </Button>
    </div>
  );
}
