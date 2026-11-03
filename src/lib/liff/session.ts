/**
 * LIFF リクエストの本人確認。
 * クライアントから送られた userId は信用せず、ID トークン（無ければアクセストークン）を
 * LINE Platform で検証して本人（line_user_id）を確定し、staff_line_accounts から staff を解決する。
 *
 * ヘッダ:
 *   x-line-id-token: <LIFF の getIDToken()>
 *   x-line-access-token: <LIFF の getAccessToken()>  （ID トークンが無い場合）
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getLineLoginChannelId } from "@/lib/env";
import {
  verifyLineAccessToken,
  verifyLineIdToken,
  type VerifiedLineUser,
} from "@/lib/line/verify";
import { resolveStaffByLineUserId, type LinkedStaff } from "@/lib/line/accounts";

export class LiffAuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "LiffAuthError";
  }
}

export interface LiffContext {
  line: VerifiedLineUser;
  staff: LinkedStaff | null;
  admin: ReturnType<typeof createAdminClient>;
}

/**
 * ヘッダのトークンを検証して LiffContext を返す。失敗時は LiffAuthError。
 *
 * ID トークン検証（/oauth2/v2.1/verify）は client_id（= LINE Login チャネルID）が必須。
 * LINE_LOGIN_CHANNEL_ID 未設定や不一致で失敗した場合は、アクセストークン
 * （/v2/profile。client_id 不要）へ自動フォールバックする。
 */
export async function getLiffContext(request: Request): Promise<LiffContext> {
  const idToken = request.headers.get("x-line-id-token");
  const accessToken = request.headers.get("x-line-access-token");
  if (!idToken && !accessToken) {
    throw new LiffAuthError("LINE トークンがありません。LINE アプリ内で開いてください。", 401);
  }

  let line: VerifiedLineUser | null = null;
  const errors: string[] = [];

  if (idToken) {
    try {
      line = await verifyLineIdToken(idToken, getLineLoginChannelId());
    } catch (e) {
      errors.push(`idToken: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!line && accessToken) {
    try {
      line = await verifyLineAccessToken(accessToken);
    } catch (e) {
      errors.push(`accessToken: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!line) {
    throw new LiffAuthError(`本人確認に失敗しました（${errors.join(" / ")}）`, 401);
  }

  const admin = createAdminClient();
  const staff = await resolveStaffByLineUserId(admin, line.userId);
  return { line, staff, admin };
}

/** staff 連携必須のエンドポイント用 */
export async function requireLiffStaff(
  request: Request,
): Promise<LiffContext & { staff: LinkedStaff }> {
  const ctx = await getLiffContext(request);
  if (!ctx.staff) {
    throw new LiffAuthError("スタッフ登録がされていません", 403);
  }
  if (!ctx.staff.active) {
    throw new LiffAuthError("このスタッフは無効化されています", 403);
  }
  return ctx as LiffContext & { staff: LinkedStaff };
}
