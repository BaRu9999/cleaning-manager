"use client";

import { useRef, useState, useTransition } from "react";
import {
  confirmShiftImportAction,
  previewShiftImportAction,
  type ShiftImportPreview,
} from "@/lib/data/shift-import-actions";
import { NEW_STAFF_SENTINEL } from "@/lib/data/shift-import";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Field";

/** UTF-8 として厳密デコードし、失敗（文字化けの原因）なら Shift_JIS で読み直す */
async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

export function ShiftImportWizard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<ShiftImportPreview | null>(null);
  const [aliasMap, setAliasMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFilename(file.name);
    setCsvText(await readCsvFile(file));
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirmError(null);
  }

  function doPreview() {
    setError(null);
    setConfirmError(null);
    setResult(null);
    if (!csvText.trim()) {
      setError("CSVを選択するか貼り付けてください");
      return;
    }
    startTransition(async () => {
      const res = await previewShiftImportAction(csvText);
      if (!res.ok) {
        setError(res.error);
        setPreview(null);
        return;
      }
      setPreview(res.data);
      // 既定は「新規スタッフとして登録」。表記ゆれ等で既存スタッフに合わせたい場合のみ選び直す
      setAliasMap(
        Object.fromEntries(res.data.unmatchedNames.map((n) => [n, NEW_STAFF_SENTINEL])),
      );
    });
  }

  function confirm() {
    if (!preview) return;
    setError(null);
    setConfirmError(null);
    startTransition(async () => {
      const res = await confirmShiftImportAction(
        JSON.stringify({ csvText, aliasMap, filename }),
      );
      if (!res.ok) {
        setConfirmError(res.error);
        return;
      }
      setResult(
        `${res.data.datesImported}日分・${res.data.staffRows}件を反映しました。` +
          (res.data.skippedNames.length > 0
            ? `未解決のためスキップ: ${res.data.skippedNames.join("、")}`
            : ""),
      );
      setPreview(null);
      setCsvText("");
    });
  }

  const totalSkipped = preview
    ? preview.unmatchedNames.filter((n) => !aliasMap[n]).length
    : 0;
  const totalNew = preview
    ? preview.unmatchedNames.filter((n) => aliasMap[n] === NEW_STAFF_SENTINEL).length
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="1. CSVを選択"
          subtitle="タニタ柏シフトの「取込用」CSV（date,name,role,start_time,end_time,...）"
        />
        <CardBody className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFile}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              ファイルを選択
            </Button>
            {filename ? <span className="text-xs text-slate-500">{filename}</span> : null}
          </div>
          <Textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setPreview(null);
            }}
            rows={6}
            placeholder="またはCSVの内容を直接貼り付け"
            className="font-mono text-xs"
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button onClick={doPreview} disabled={pending}>
            {pending ? "解析中…" : "プレビュー"}
          </Button>
        </CardBody>
      </Card>

      {preview ? (
        <Card>
          <CardHeader
            title="2. 内容の確認"
            subtitle={`${preview.dateFrom} 〜 ${preview.dateTo} ／ ${preview.rowCount}行 ／ ${preview.dates.length}日分`}
          />
          <CardBody className="space-y-3">
            {preview.unmatchedNames.length > 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="mb-2 text-sm font-bold text-amber-800">
                  未登録の氏名（{preview.unmatchedNames.length}名）— 既定では新規スタッフとして
                  自動登録されます。既存スタッフの表記ゆれの場合のみ選び直してください。
                </p>
                <div className="space-y-2">
                  {preview.unmatchedNames.map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-sm font-bold text-slate-700">{name}</span>
                      <Select
                        value={aliasMap[name] ?? NEW_STAFF_SENTINEL}
                        onChange={(e) =>
                          setAliasMap((m) => ({ ...m, [name]: e.target.value }))
                        }
                      >
                        <option value={NEW_STAFF_SENTINEL}>
                          新規スタッフとして登録（ログイン・LINE通知なし）
                        </option>
                        <option value="">スキップ（取り込まない）</option>
                        {preview.staffOptions.map((s) => (
                          <option key={s.userId} value={s.userId}>
                            既存スタッフ：{s.displayName}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-amber-700">
                  一度選ぶと次回以降は自動で解決されます（氏名マッピングとして保存）。
                </p>
              </div>
            ) : (
              <Alert tone="success">全員のスタッフが自動的に解決されました。</Alert>
            )}

            <div className="scroll-x">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-1.5 pr-2">日付</th>
                    <th className="px-2 py-1.5">氏名</th>
                    <th className="px-2 py-1.5">担当</th>
                    <th className="px-2 py-1.5">時間</th>
                    <th className="px-2 py-1.5">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.dates.flatMap((d) =>
                    d.entries.map((e) => {
                      const chosen = e.matchedUserId ?? aliasMap[e.name] ?? "";
                      const status =
                        chosen === ""
                          ? { label: "スキップ", cls: "text-slate-400" }
                          : chosen === NEW_STAFF_SENTINEL
                            ? { label: "新規登録", cls: "text-sky-600" }
                            : { label: "連携OK", cls: "text-emerald-600" };
                      return (
                        <tr key={`${d.date}-${e.name}`} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2 tabular text-xs text-slate-500">{d.date}</td>
                          <td className="px-2 py-1.5 font-bold text-slate-800">{e.name}</td>
                          <td className="px-2 py-1.5 text-xs">{e.positions.join("・") || "—"}</td>
                          <td className="px-2 py-1.5 tabular text-xs">
                            {e.startTime ?? "—"}〜{e.endTime ?? "—"}
                          </td>
                          <td className={`px-2 py-1.5 text-xs font-bold ${status.cls}`}>
                            {status.label}
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-400">
              取り込むと、CSVに含まれる日付の「本日の出勤スタッフ」はこの内容で置き換わります
              （手動で設定した内容も上書きされます）。
            </p>

            {confirmError ? <Alert tone="danger">{confirmError}</Alert> : null}
            <Button onClick={confirm} disabled={pending} variant="success">
              {pending
                ? "反映中…"
                : totalNew > 0 || totalSkipped > 0
                  ? `この内容で取り込む（新規登録${totalNew}名${
                      totalSkipped > 0 ? `・スキップ${totalSkipped}名` : ""
                    }）`
                  : "この内容で取り込む"}
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {result ? <Alert tone="success">{result}</Alert> : null}
    </div>
  );
}
