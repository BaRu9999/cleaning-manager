/**
 * LIFF からの清掃写真アップロード（本人の担当タスクのみ）。
 * multipart/form-data: file=<画像>
 * Storage への書き込みはサーバーの service_role で行い、Storage キーはブラウザへ出さない。
 */
import { NextResponse } from "next/server";
import { requireLiffStaff } from "@/lib/liff/session";
import { liffErrorResponse } from "@/lib/liff/respond";
import { PHOTO_BUCKET, MAX_PHOTOS_PER_TASK } from "@/config/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { staff, admin } = await requireLiffStaff(request);
    const { id } = await params;

    const { data: task } = await admin
      .from("cleaning_tasks")
      .select("id, assignee_id, task_date")
      .eq("id", id)
      .maybeSingle();
    if (!task) {
      return NextResponse.json({ ok: false, error: "タスクが見つかりません" }, { status: 404 });
    }
    if (String((task as Record<string, unknown>).assignee_id ?? "") !== staff.staffId) {
      return NextResponse.json({ ok: false, error: "自分の担当タスクではありません" }, { status: 403 });
    }

    const { count: existing } = await admin
      .from("cleaning_photos")
      .select("id", { count: "exact", head: true })
      .eq("task_id", id);
    if ((existing ?? 0) >= MAX_PHOTOS_PER_TASK) {
      return NextResponse.json(
        { ok: false, error: `写真は最大 ${MAX_PHOTOS_PER_TASK} 枚までです` },
        { status: 422 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file がありません" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "画像が大きすぎます（8MBまで）" }, { status: 413 });
    }
    const type = file.type || "image/jpeg";
    const ext = EXT[type] ?? "jpg";
    const taskDate = String((task as Record<string, unknown>).task_date);
    const path = `${taskDate}/${id}/${crypto.randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from(PHOTO_BUCKET)
      .upload(path, buf, { contentType: type, upsert: false });
    if (upErr) {
      return NextResponse.json({ ok: false, error: `アップロード失敗: ${upErr.message}` }, { status: 500 });
    }

    const { data: photo, error: insErr } = await admin
      .from("cleaning_photos")
      .insert({
        task_id: id,
        storage_path: path,
        uploaded_by: staff.staffId,
        bytes: file.size,
      })
      .select("id")
      .single();
    if (insErr || !photo) {
      await admin.storage.from(PHOTO_BUCKET).remove([path]);
      return NextResponse.json({ ok: false, error: "写真の登録に失敗しました" }, { status: 500 });
    }

    const { data: signed } = await admin.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 3600);

    return NextResponse.json({
      ok: true,
      photoId: String((photo as { id: string }).id),
      signedUrl: signed?.signedUrl ?? null,
      count: (existing ?? 0) + 1,
    });
  } catch (e) {
    return liffErrorResponse(e);
  }
}
