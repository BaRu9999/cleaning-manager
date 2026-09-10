"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "@/config/constants";
import { reopenTaskAction, skipTaskAction } from "@/lib/data/task-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";

export function AdminTaskControls({
  taskId,
  status,
}: {
  taskId: string;
  status: TaskStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSkip, setShowSkip] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "エラー");
      else router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-bold text-slate-500">管理者操作</p>
      <div className="flex flex-wrap gap-2">
        {status !== "skipped" && status !== "done" ? (
          <Button size="sm" variant="secondary" onClick={() => setShowSkip((v) => !v)}>
            スキップ
          </Button>
        ) : null}
        {status === "done" || status === "skipped" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run(() => reopenTaskAction(taskId))}
            disabled={pending}
          >
            {status === "done" ? "完了を取り消す" : "再開する"}
          </Button>
        ) : null}
      </div>

      {showSkip ? (
        <div className="mt-2 flex gap-2">
          <TextInput
            placeholder="スキップ理由（必須）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() =>
              run(async () => {
                const r = await skipTaskAction(taskId, reason);
                if (r.ok) setShowSkip(false);
                return r;
              })
            }
            disabled={pending || !reason.trim()}
          >
            確定
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
