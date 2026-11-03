"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ItemTiming } from "@/lib/cleaning/time-analysis";
import { applyRecommendedEstimateAction } from "@/lib/data/time-analysis-actions";
import { Alert } from "@/components/ui/Alert";

export function TimeAnalysisTable({ items }: { items: ItemTiming[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(item: ItemTiming) {
    if (!item.masterId || !item.recommendedRange) return;
    const mid = Math.round((item.recommendedRange.min + item.recommendedRange.max) / 2);
    if (
      !confirm(
        `「${item.masterName}」の所要時間目安を ${item.currentEstimate ?? "未設定"}分 → ${mid}分 に変更します。よろしいですか？`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await applyRecommendedEstimateAction(item.masterId!, mid);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">この期間の完了実績がありません。</p>;
  }

  return (
    <div className="space-y-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="scroll-x">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-2">清掃項目</th>
              <th className="px-2 py-2 text-right">件数</th>
              <th className="px-2 py-2 text-right">現在設定</th>
              <th className="px-2 py-2 text-right">平均実績</th>
              <th className="px-2 py-2 text-right">中央値</th>
              <th className="px-2 py-2 text-right">差</th>
              <th className="px-2 py-2">推奨</th>
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.masterId ?? it.masterName} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-bold text-slate-800">{it.masterName}</td>
                <td className="px-2 py-2 text-right tabular">{it.count}</td>
                <td className="px-2 py-2 text-right tabular">
                  {it.currentEstimate != null ? `${it.currentEstimate}分` : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular">{it.avgActual}分</td>
                <td className="px-2 py-2 text-right tabular">{it.medianActual}分</td>
                <td
                  className={`px-2 py-2 text-right tabular font-bold ${
                    it.diffMinutes != null && it.diffMinutes > 0 ? "text-red-600" : "text-slate-600"
                  }`}
                >
                  {it.diffMinutes != null
                    ? `${it.diffMinutes > 0 ? "+" : ""}${it.diffMinutes}分`
                    : "—"}
                </td>
                <td className="px-2 py-2 text-xs">
                  {!it.sufficientSample
                    ? "実績不足"
                    : it.recommendedRange
                      ? `${it.recommendedRange.min}〜${it.recommendedRange.max}分`
                      : "現状で妥当"}
                </td>
                <td className="py-2 pl-2 text-right">
                  {it.recommendedRange && it.masterId ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => apply(it)}
                      className="tap rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50"
                    >
                      推奨時間を適用
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        「実績不足」は完了実績が3件未満の項目です。設定時間と実績中央値の差が20%以上のときのみ推奨を表示します。
      </p>
    </div>
  );
}
