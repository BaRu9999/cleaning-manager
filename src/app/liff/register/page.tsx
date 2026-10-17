"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiff } from "@/components/liff/LiffBoot";
import { JOB_TITLE_LABELS, type JobTitle } from "@/config/constants";

interface Option {
  staffId: string;
  displayName: string;
  position: string | null;
  jobTitle: string;
}

export default function LiffRegisterPage() {
  const { ready, liffFetch } = useLiff();
  const router = useRouter();
  const [options, setOptions] = useState<Option[] | null>(null);
  const [mode, setMode] = useState<"list" | "code">("list");
  const [selected, setSelected] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const res = await liffFetch("/api/liff/register-options", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "取得に失敗しました");
        if (json.alreadyLinked) {
          router.replace("/liff/today");
          return;
        }
        setOptions(json.options as Option[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラー");
      }
    })();
  }, [ready, liffFetch, router]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const body = mode === "list" ? { staffId: selected } : { staffCode: code.trim() };
      const res = await liffFetch("/api/liff/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "登録に失敗しました");
      router.replace("/liff/today");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-6">
      <h1 className="text-lg font-bold text-slate-900">スタッフ登録</h1>
      <p className="mt-1 text-sm text-slate-500">あなたのスタッフ情報を選択してください。</p>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1 text-sm font-bold">
        <button
          onClick={() => setMode("list")}
          className={`rounded-md py-2 ${mode === "list" ? "bg-white text-slate-900" : "text-slate-500"}`}
        >
          一覧から選ぶ
        </button>
        <button
          onClick={() => setMode("code")}
          className={`rounded-md py-2 ${mode === "code" ? "bg-white text-slate-900" : "text-slate-500"}`}
        >
          コード入力
        </button>
      </div>

      {mode === "list" ? (
        <div className="mt-4 space-y-2">
          {options == null ? (
            <p className="text-sm text-slate-400">読み込み中…</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-slate-500">
              登録できるスタッフがいません。管理者にスタッフ登録を依頼してください。
            </p>
          ) : (
            options.map((o) => (
              <label
                key={o.staffId}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  selected === o.staffId
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="staff"
                  className="h-5 w-5"
                  checked={selected === o.staffId}
                  onChange={() => setSelected(o.staffId)}
                />
                <span>
                  <span className="block text-base font-bold text-slate-900">
                    {o.displayName}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {o.position ?? "ポジション未設定"} ・{" "}
                    {JOB_TITLE_LABELS[o.jobTitle as JobTitle] ?? o.jobTitle}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
      ) : (
        <div className="mt-4">
          <label className="block text-sm font-bold text-slate-700">スタッフコード</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="管理者から受け取ったコード"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base tracking-widest"
          />
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <button
        onClick={submit}
        disabled={busy || (mode === "list" ? !selected : code.trim().length < 3)}
        className="mt-4 w-full rounded-xl bg-slate-900 py-3.5 text-base font-bold text-white disabled:bg-slate-400"
      >
        {busy ? "登録中…" : "この内容で登録する"}
      </button>
    </div>
  );
}
