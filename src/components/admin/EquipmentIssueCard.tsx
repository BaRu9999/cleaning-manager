"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EQUIPMENT_SEVERITY_LABELS, type EquipmentSeverity } from "@/config/constants";
import {
  resolveEquipmentIssueAction,
  startEquipmentIssueAction,
} from "@/lib/data/equipment-issue-actions";
import { formatInstantJst } from "@/lib/date/jst";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";

export interface EquipmentIssueCardData {
  id: string;
  reportedAt: string;
  reportedByName: string | null;
  masterName: string | null;
  areaName: string | null;
  title: string;
  description: string | null;
  severity: EquipmentSeverity;
  status: "open" | "in_progress" | "resolved";
  photoSignedUrl?: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
}

const SEVERITY_TONE: Record<EquipmentSeverity, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export function EquipmentIssueCard({ issue }: { issue: EquipmentIssueCardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  // 「対応開始」はクリック直後に反映（失敗時は自動でissue.statusへ戻る＝ロールバック）
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(issue.status);

  function start() {
    setError(null);
    startTransition(async () => {
      setOptimisticStatus("in_progress");
      const res = await startEquipmentIssueAction(issue.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function resolve() {
    setError(null);
    startTransition(async () => {
      const res = await resolveEquipmentIssueAction(issue.id, note);
      if (!res.ok) setError(res.error);
      else {
        setResolving(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", SEVERITY_TONE[issue.severity])}>
              {EQUIPMENT_SEVERITY_LABELS[issue.severity]}
            </span>
            <span className="text-base font-bold text-slate-900">{issue.title}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {[issue.areaName, issue.masterName].filter(Boolean).join(" / ") || "場所未指定"} ・{" "}
            {issue.reportedByName ?? "不明"} ・ {formatInstantJst(issue.reportedAt)}
          </div>
          {issue.description ? (
            <p className="mt-1 text-sm text-slate-700">{issue.description}</p>
          ) : null}
          {issue.photoSignedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={issue.photoSignedUrl}
              alt="設備異常の写真"
              className="mt-2 h-32 w-32 rounded-lg object-cover"
            />
          ) : null}
          {issue.status === "resolved" ? (
            <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
              {formatInstantJst(issue.resolvedAt)} {issue.resolvedByName} が解決
              {issue.resolutionNote ? ` ／ ${issue.resolutionNote}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      ) : null}

      {optimisticStatus !== "resolved" ? (
        <div className="mt-3 flex gap-2">
          {optimisticStatus === "open" ? (
            <Button size="sm" variant="secondary" onClick={start} disabled={pending}>
              対応開始
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setResolving((v) => !v)} disabled={pending}>
            解決
          </Button>
        </div>
      ) : null}

      {resolving ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="対応内容（任意）"
            rows={2}
          />
          <Button size="sm" onClick={resolve} disabled={pending}>
            {pending ? "処理中…" : "解決として記録"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
