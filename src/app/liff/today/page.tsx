"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLiff } from "@/components/liff/LiffBoot";
import { resizeImage } from "@/lib/media/resizeImage";
import {
  PHOTO_REQUIREMENT_LABELS,
  TASK_STATUS_LABELS,
  type PhotoRequirement,
  type TaskStatus,
} from "@/config/constants";

interface LiffTask {
  id: string;
  name: string;
  area: string | null;
  slotLabel: string;
  dueLabel: string | null;
  estimatedMinutes: number | null;
  priority: string;
  photoRequirement: PhotoRequirement;
  photoCount: number;
  status: TaskStatus;
  comment: string | null;
}

interface TodayData {
  date: string;
  staff: { displayName: string };
  progress: { done: number; total: number; rate: number };
  tasks: LiffTask[];
}

const STATUS_CLASS: Record<TaskStatus, string> = {
  pending: "border-slate-200 bg-white",
  in_progress: "border-sky-300 bg-sky-50",
  done: "border-emerald-300 bg-emerald-50",
  overdue: "border-red-300 bg-red-50",
  skipped: "border-slate-200 bg-slate-50 opacity-70",
};

export default function LiffTodayPage() {
  const { ready, liffFetch } = useLiff();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needRegister, setNeedRegister] = useState(false);

  const load = useCallback(async () => {
    const res = await liffFetch("/api/liff/today", { method: "POST" });
    if (res.status === 403) {
      setNeedRegister(true);
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "取得に失敗しました");
      return;
    }
    setData(json as TodayData);
  }, [liffFetch]);

  useEffect(() => {
    if (ready) load().catch((e) => setError(String(e)));
  }, [ready, load]);

  if (needRegister) {
    return (
      <div className="mx-auto max-w-sm p-6 text-center">
        <p className="text-base font-bold text-slate-800">スタッフ登録が必要です</p>
        <Link
          href="/liff/register"
          className="mt-4 inline-block rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white"
        >
          スタッフ登録へ
        </Link>
      </div>
    );
  }
  if (error) {
    return <div className="mx-auto max-w-sm p-6 text-sm text-red-600">{error}</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-slate-400">読み込み中…</div>;
  }

  const allDone = data.tasks.length > 0 && data.progress.done === data.progress.total;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold text-slate-500">
          本日の清掃 ・ {Number(data.date.slice(5, 7))}/{Number(data.date.slice(8, 10))}
        </div>
        <div className="mt-1 flex items-end justify-between">
          <span className="text-2xl font-bold text-slate-900">
            {data.tasks.length}件中{data.progress.done}件完了
          </span>
          <span className="text-2xl font-bold text-slate-700">{data.progress.rate}%</span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, data.progress.rate)}%` }}
          />
        </div>
        {allDone ? (
          <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-center text-sm font-bold text-emerald-700">
            本日の担当清掃がすべて完了しました
          </p>
        ) : null}
      </div>

      {data.tasks.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-500">本日の担当清掃はありません。</p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.tasks.map((t) => (
            <TaskCard key={t.id} task={t} liffFetch={liffFetch} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  liffFetch,
  onChanged,
}: {
  task: LiffTask;
  liffFetch: (p: string, i?: RequestInit) => Promise<Response>;
  onChanged: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [photoCount, setPhotoCount] = useState(task.photoCount);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [expand, setExpand] = useState(false);

  const needPhoto = task.photoRequirement === "required" && photoCount < 1;

  async function act(action: "start" | "complete") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await liffFetch(`/api/liff/tasks/${task.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "complete" ? { action, comment: comment.trim() || undefined } : { action },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "失敗しました");
        return;
      }
      if (action === "complete") {
        setStatus("done");
        setMsg("完了しました");
      } else {
        setStatus("in_progress");
        setExpand(true);
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const resized = await resizeImage(f);
      const fd = new FormData();
      fd.set("file", resized);
      const res = await liffFetch(`/api/liff/tasks/${task.id}/photo`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "アップロードに失敗しました");
        return;
      }
      setPhotoCount(json.count ?? photoCount + 1);
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "アップロードに失敗しました（通信エラー）。電波の良い場所でもう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${STATUS_CLASS[status]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold text-slate-900">{task.name}</div>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm text-slate-600">
            <div>場所：{task.area ?? "—"}</div>
            <div>期限：{task.dueLabel ? `${task.dueLabel}まで` : "なし"}</div>
            <div>時間帯：{task.slotLabel}</div>
            <div>目安：{task.estimatedMinutes != null ? `${task.estimatedMinutes}分` : "—"}</div>
          </dl>
          <div className="mt-1 text-xs text-slate-400">
            {PHOTO_REQUIREMENT_LABELS[task.photoRequirement]}
            {photoCount > 0 ? ` ・ 写真${photoCount}枚` : ""}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
          {TASK_STATUS_LABELS[status]}
        </span>
      </div>

      {status === "done" ? (
        <p className="mt-3 text-sm font-bold text-emerald-700">完了しました</p>
      ) : (
        <div className="mt-3 space-y-2">
          {status === "in_progress" || expand ? (
            <>
              {task.photoRequirement !== "none" ? (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPick}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
                  >
                    {busy ? "処理中…" : "写真を撮影 / 選択"}
                    {task.photoRequirement === "required" ? "（必須）" : ""}
                  </button>
                </div>
              ) : null}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="コメント（任意）"
                rows={2}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </>
          ) : null}

          {status === "pending" || status === "overdue" ? (
            <button
              onClick={() => act("start")}
              disabled={busy}
              className="w-full rounded-xl bg-slate-900 py-3.5 text-base font-bold text-white disabled:bg-slate-400"
            >
              清掃を開始
            </button>
          ) : (
            <button
              onClick={() => act("complete")}
              disabled={busy || needPhoto}
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white disabled:bg-emerald-300"
            >
              {needPhoto ? "写真を撮影してください" : "完了する"}
            </button>
          )}
        </div>
      )}

      {msg ? <p className="mt-2 text-xs font-semibold text-slate-600">{msg}</p> : null}
    </div>
  );
}
