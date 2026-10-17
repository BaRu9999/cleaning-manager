/**
 * LINE の ID トークン検証。
 * LIFF クライアントから送られた userId をそのまま信用せず、
 * ID トークンを LINE Platform で検証して本人（sub = userId）を確定する。
 *
 *   POST https://api.line.me/oauth2/v2.1/verify
 *   body: id_token, client_id(=LINE Login チャネルID)
 */

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const PROFILE_URL = "https://api.line.me/v2/profile";

export interface VerifiedLineUser {
  userId: string; // sub
  displayName: string | null;
  picture: string | null;
}

export class LineVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LineVerifyError";
  }
}

/** ID トークンを検証して本人情報を返す。失敗時は LineVerifyError。 */
export async function verifyLineIdToken(
  idToken: string,
  channelId: string | null,
): Promise<VerifiedLineUser> {
  if (!idToken || idToken.length < 20) {
    throw new LineVerifyError("ID トークンがありません");
  }
  const body = new URLSearchParams({ id_token: idToken });
  if (channelId) body.set("client_id", channelId);

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new LineVerifyError(
      `ID トークンの検証に失敗しました: ${String(json.error_description ?? json.error ?? res.status)}`,
    );
  }
  const sub = typeof json.sub === "string" ? json.sub : "";
  if (!sub) throw new LineVerifyError("検証結果に userId (sub) がありません");

  // aud（= client_id）チェック（channelId 指定時のみ）
  if (channelId && json.aud !== channelId) {
    throw new LineVerifyError("ID トークンの発行先チャネルが一致しません");
  }
  // 有効期限
  if (typeof json.exp === "number" && json.exp * 1000 < Date.now()) {
    throw new LineVerifyError("ID トークンの有効期限が切れています");
  }

  return {
    userId: sub,
    displayName: typeof json.name === "string" ? json.name : null,
    picture: typeof json.picture === "string" ? json.picture : null,
  };
}

/** アクセストークンから profile を取得して userId を確定（ID トークンが無い場合の代替） */
export async function verifyLineAccessToken(
  accessToken: string,
): Promise<VerifiedLineUser> {
  const res = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new LineVerifyError(`アクセストークンの検証に失敗しました (HTTP ${res.status})`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const userId = typeof json.userId === "string" ? json.userId : "";
  if (!userId) throw new LineVerifyError("profile に userId がありません");
  return {
    userId,
    displayName: typeof json.displayName === "string" ? json.displayName : null,
    picture: typeof json.pictureUrl === "string" ? json.pictureUrl : null,
  };
}
