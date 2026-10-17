/**
 * 縮小に失敗した場合でも許容する上限バイト数。
 * LIFF 経由（Vercel Serverless Function 経由、ボディ上限は約4.5MB）でも、
 * 通常ログイン画面（ブラウザから Supabase Storage へ直接アップロード）でも
 * 安全に収まるよう、どちらの上限より十分小さい値にしておく。
 */
const MAX_SAFE_UPLOAD_BYTES = 4_000_000;

/**
 * <img> 経由でデコード（createImageBitmap が使えない/失敗する環境向けフォールバック。
 * iOS Safari は HEIC を <img> では描画できても createImageBitmap でデコードできない場合がある）。
 */
function loadViaImgElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = url;
  });
}

/**
 * スマホ撮影画像をアップロード前に縮小する（長辺 1600px / JPEG 0.82）。
 * サーバー body 上限やモバイル回線を考慮。LIFF・通常ログイン両方の写真アップロードで共用。
 *
 * 重要: デコードに失敗しても元ファイルをそのまま返してはいけない。
 * iPhone の HEIC 写真は createImageBitmap でのデコードに失敗することがあり、
 * その際に無圧縮の元ファイル（数MB〜）をそのまま送ると、LIFF 経由では Vercel の
 * Serverless Function のボディ上限（約4.5MB）を超えて接続が切られ、ブラウザ側には
 * "Load failed" という分かりにくいエラーだけが表示される（実際の原因はサーバーの
 * 応答ではなく、リクエストが途中で切断されること）。縮小できない場合は、上限を
 * 下回るときだけ元ファイルを許容し、それ以外は呼び出し側でエラー表示できるよう
 * 例外を投げる。
 */
export async function resizeImage(
  file: File,
  maxEdge = 1600,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    if (file.size > MAX_SAFE_UPLOAD_BYTES) {
      throw new Error("ファイルが大きすぎます。画像を選び直してください。");
    }
    return file;
  }

  let source: HTMLImageElement | ImageBitmap;
  try {
    source = await createImageBitmap(file);
  } catch {
    try {
      source = await loadViaImgElement(file);
    } catch {
      if (file.size <= MAX_SAFE_UPLOAD_BYTES) return file;
      throw new Error(
        "写真を処理できませんでした。カメラの設定を「互換性優先（JPEG）」にするか、" +
          "もう一度お試しください。",
      );
    }
  }

  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxEdge / Math.max(width, height));

  if (scale >= 1 && file.size < 1_200_000) return file;

  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (file.size <= MAX_SAFE_UPLOAD_BYTES) return file;
    throw new Error("写真を処理できませんでした。もう一度お試しください。");
  }
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) {
    if (file.size <= MAX_SAFE_UPLOAD_BYTES) return file;
    throw new Error("写真を処理できませんでした。もう一度お試しください。");
  }
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}
