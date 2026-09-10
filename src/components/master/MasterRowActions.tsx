"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  deleteMasterAction,
  setMasterActiveAction,
} from "@/lib/data/master-actions";

export function MasterRowActions({
  id,
  active,
  name,
}: {
  id: string;
  active: boolean;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggleActive() {
    setErr(null);
    startTransition(async () => {
      const res = await setMasterActiveAction(id, !active);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!confirm(`「${name}」を削除します。過去の履歴は残りますが元に戻せません。よろしいですか？`))
      return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteMasterAction(id);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-1">
        <Link
          href={`/admin/master/${id}`}
          className="tap rounded-md border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700"
        >
          編集
        </Link>
        <button
          type="button"
          onClick={toggleActive}
          disabled={pending}
          className="tap rounded-md border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 disabled:opacity-50"
        >
          {active ? "無効化" : "有効化"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="tap rounded-md border border-red-300 px-2.5 py-1 text-xs font-bold text-red-600 disabled:opacity-50"
        >
          削除
        </button>
      </div>
      {err ? <span className="text-xs font-semibold text-red-600">{err}</span> : null}
    </div>
  );
}
