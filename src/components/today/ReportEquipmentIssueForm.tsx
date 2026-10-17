"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  EQUIPMENT_SEVERITIES,
  EQUIPMENT_SEVERITY_LABELS,
  PHOTO_BUCKET,
  type EquipmentSeverity,
} from "@/config/constants";
import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/media/resizeImage";
import { reportEquipmentIssueAction } from "@/lib/data/equipment-issue-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea, TextInput } from "@/components/ui/Field";

const EXAMPLES = ["冷凍庫の霜が異常", "水漏れ", "ゴムパッキン破損", "電球切れ", "異音", "温度異常", "排水不良"];

export function ReportEquipmentIssueForm({
  taskId,
  masterId,
  areaId,
  defaultTitle,
  onDone,
}: {
  taskId?: string | null;
  masterId?: string | null;
  areaId?: string | null;
  defaultTitle?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<EquipmentSeverity>("medium");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const resized = await resizeImage(file);
      const supabase = createClient();
      const ext = resized.type.split("/")[1] ?? "jpg";
      const path = `equipment/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, resized, { contentType: resized.type || "image/jpeg" });
      if (upErr) {
        setError(`アップロードに失敗しました: ${upErr.message}`);
        return;
      }
      setPhotoPath(path);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "アップロードに失敗しました（通信エラー）。電波の良い場所でもう一度お試しください。",
      );
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError(null);
    if (!title.trim()) {
      setError("内容を入力してください");
      return;
    }
    startTransition(async () => {
      const res = await reportEquipmentIssueAction(
        JSON.stringify({
          taskId: taskId ?? null,
          masterId: masterId ?? null,
          areaId: areaId ?? null,
          title: title.trim(),
          description: description.trim() || null,
          severity,
          photoPath,
        }),
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo("設備異常を報告しました。管理者に通知されます。");
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <Field label="内容" required hint={`例: ${EXAMPLES.join(" / ")}`}>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="水漏れ" />
      </Field>
      <Field label="詳細（任意）">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </Field>
      <Field label="重要度">
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as EquipmentSeverity)}>
          {EQUIPMENT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {EQUIPMENT_SEVERITY_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "アップロード中…" : photoPath ? "写真を撮影済み ✓" : "写真を追加（任意）"}
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}
      <Button variant="danger" size="sm" onClick={submit} disabled={pending || uploading}>
        {pending ? "送信中…" : "設備異常を報告"}
      </Button>
    </div>
  );
}
