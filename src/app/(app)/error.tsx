"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-lg font-bold text-slate-800">エラーが発生しました</p>
      <p className="mt-2 break-words text-sm text-slate-500">
        {error.message || "しばらくしてからもう一度お試しください。"}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
        >
          再読み込み
        </button>
        <Link
          href="/today"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
        >
          今日の清掃へ
        </Link>
      </div>
    </div>
  );
}
