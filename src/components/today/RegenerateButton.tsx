"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateTasksAction } from "@/lib/data/generation-actions";

export function RegenerateButton({
  date,
  label = "本日のタスクを生成",
}: {
  date?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMsg(null);
            const res = await regenerateTasksAction(date);
            if (!res.ok) setMsg(res.error);
            else {
              setMsg(`生成 ${res.data.inserted} 件 / 対象 ${res.data.planned} 件`);
              router.refresh();
            }
          })
        }
        className="tap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
      >
        {pending ? "生成中…" : label}
      </button>
      {msg ? <span className="text-xs text-slate-500">{msg}</span> : null}
    </div>
  );
}
