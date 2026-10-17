"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * LIFF エンドポイント URL（`https://<SITE>/liff`）を直接開いた場合の入口。
 * `liff.line.me/<LIFF_ID>`（パスなし）や QR / リッチメニューからの遷移をここで受け、
 * LIFF 初期化後に「今日の清掃」へ送る（未登録なら /liff/today がスタッフ登録へ誘導）。
 * LiffBoot（layout）が ready になってから children としてマウントされるため、
 * ここに来た時点で LIFF は初期化済み。
 */
export default function LiffIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/liff/today");
  }, [router]);
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-slate-400">
      読み込み中…
    </div>
  );
}
