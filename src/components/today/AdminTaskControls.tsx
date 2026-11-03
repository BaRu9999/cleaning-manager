"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "@/config/constants";
import { reopenTaskAction } from "@/lib/data/task-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SkipTaskForm } from "./SkipTaskForm";

export function AdminTaskControls({
  taskId,
  status,
}: {
  taskId: string;
  status: TaskStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
            実施不可
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
        <div className="mt-2">
          <SkipTaskForm taskId={taskId} onDone={() => setShowSkip(false)} />
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
