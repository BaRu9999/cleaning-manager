"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_PHOTOS_PER_TASK,
  MAX_PHOTO_BYTES,
  PHOTO_BUCKET,
  type PhotoRequirement,
  type TaskStatus,
} from "@/config/constants";
import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/media/resizeImage";
import {
  attachPhotoAction,
  completeTaskAction,
  deletePhotoAction,
  startTaskAction,
} from "@/lib/data/task-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Textarea, TextInput } from "@/components/ui/Field";
import { SkipTaskForm } from "./SkipTaskForm";
import { ReportEquipmentIssueForm } from "./ReportEquipmentIssueForm";

interface PhotoItem {
  id: string;
  signedUrl: string | null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function CompleteForm({
  taskId,
  taskDate,
  status,
  photoRequirement,
  initialPhotos,
  canOperate,
  masterId,
  areaId,
  masterName,
}: {
  taskId: string;
  taskDate: string;
  status: TaskStatus;
  photoRequirement: PhotoRequirement;
  initialPhotos: PhotoItem[];
  canOperate: boolean;
  masterId?: string | null;
  areaId?: string | null;
  masterName?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos);
  const [comment, setComment] = useState("");
  const [minutes, setMinutes] = useState("");
  const [showSkip, setShowSkip] = useState(false);
  const [showIssue, setShowIssue] = useState(false);

  const needPhoto = photoRequirement === "required" && photos.length === 0;

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS_PER_TASK) {
      setError(`写真は最大 ${MAX_PHOTOS_PER_TASK} 枚までです`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      for (const file of files) {
        let resized: File;
        try {
          resized = await resizeImage(file);
        } catch (e) {
          setError(e instanceof Error ? e.message : `「${file.name}」を処理できませんでした`);
          continue;
        }
        if (resized.size > MAX_PHOTO_BYTES) {
          setError(`「${file.name}」が大きすぎます（10MBまで）`);
          continue;
        }
        const ext = EXT[resized.type] ?? "jpg";
        const path = `${taskDate}/${taskId}/${crypto.randomUUID()}.${ext}`;
        try {
          const { error: upErr } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, resized, { contentType: resized.type || "image/jpeg", upsert: false });
          if (upErr) {
            setError(`アップロードに失敗しました: ${upErr.message}`);
            continue;
          }
          const res = await attachPhotoAction({
            taskId,
            storagePath: path,
            bytes: resized.size,
          });
          if (!res.ok) {
            setError(res.error);
            continue;
          }
          const { data: signed } = await supabase.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(path, 3600);
          setPhotos((p) => [
            ...p,
            { id: res.data.id, signedUrl: signed?.signedUrl ?? null },
          ]);
        } catch (e) {
          setError(
            e instanceof Error
              ? `アップロードに失敗しました（通信エラー）: ${e.message}`
              : "アップロードに失敗しました（通信エラー）。電波の良い場所でもう一度お試しください。",
          );
        }
      }
    } finally {
      setUploading(false);
      router.refresh();
    }
  }

  function removePhoto(id: string) {
    startTransition(async () => {
      const res = await deletePhotoAction(id, taskId);
      if (!res.ok) setError(res.error);
      else {
        setPhotos((p) => p.filter((x) => x.id !== id));
        router.refresh();
      }
    });
  }

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await startTaskAction(taskId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function complete() {
    setError(null);
    if (needPhoto) {
      setError("この清掃は写真が必須です。写真を追加してください。");
      return;
    }
    startTransition(async () => {
      const res = await completeTaskAction(taskId, {
        comment: comment.trim() || undefined,
        actualMinutes: minutes ? Number(minutes) : null,
      });
      if (!res.ok) setError(res.error);
      else {
        router.push("/today");
        router.refresh();
      }
    });
  }

  if (status === "done" || status === "skipped") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">
          このタスクは{status === "done" ? "完了済み" : "スキップ済み"}です。
          {canOperate ? "" : " 変更は管理者に依頼してください。"}
        </p>
        {photos.length > 0 ? <PhotoGrid photos={photos} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {status !== "in_progress" ? (
        <Button size="lg" onClick={start} disabled={pending}>
          清掃開始
        </Button>
      ) : null}

      <div>
        <span className="mb-1 block text-sm font-bold text-slate-700">
          写真
          {photoRequirement === "required" ? (
            <span className="text-red-500">（必須）</span>
          ) : photoRequirement === "none" ? (
            <span className="text-slate-400">（不要）</span>
          ) : (
            <span className="text-slate-400">（任意）</span>
          )}
        </span>
        <PhotoGrid photos={photos} onRemove={canOperate ? removePhoto : undefined} />
        {photoRequirement !== "none" && photos.length < MAX_PHOTOS_PER_TASK ? (
          <div className="mt-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onPickFiles}
            />
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || pending}
            >
              {uploading ? "アップロード中…" : "写真を撮影 / 選択"}
            </Button>
          </div>
        ) : null}
      </div>

      <Field label="完了コメント（任意）">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="気づいた点・申し送りなど"
        />
      </Field>
      <Field label="実際にかかった時間（分・任意）">
        <TextInput
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="max-w-[8rem]"
        />
      </Field>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Button
        size="lg"
        variant="success"
        onClick={complete}
        disabled={pending || uploading}
      >
        {pending ? "処理中…" : "完了する"}
      </Button>

      <div className="flex gap-2 border-t border-slate-100 pt-3">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => setShowSkip((v) => !v)}
        >
          実施不可
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => setShowIssue((v) => !v)}
        >
          設備異常を報告
        </Button>
      </div>
      {showSkip ? <SkipTaskForm taskId={taskId} onDone={() => setShowSkip(false)} /> : null}
      {showIssue ? (
        <ReportEquipmentIssueForm
          taskId={taskId}
          masterId={masterId}
          areaId={areaId}
          defaultTitle={masterName ? `${masterName}の設備で異常` : undefined}
          onDone={() => setShowIssue(false)}
        />
      ) : null}
    </div>
  );
}

function PhotoGrid({
  photos,
  onRemove,
}: {
  photos: PhotoItem[];
  onRemove?: (id: string) => void;
}) {
  if (photos.length === 0) {
    return <p className="text-xs text-slate-400">写真はまだありません</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => (
        <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
          {p.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.signedUrl} alt="清掃写真" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-slate-400">
              読み込み不可
            </div>
          )}
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs font-bold text-white"
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
