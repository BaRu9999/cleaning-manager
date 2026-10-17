import { NextResponse } from "next/server";
import { LiffAuthError } from "./session";

/** LIFF API の例外を JSON に変換 */
export function liffErrorResponse(e: unknown): NextResponse {
  if (e instanceof LiffAuthError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  }
  return NextResponse.json(
    { ok: false, error: e instanceof Error ? e.message : "サーバーエラー" },
    { status: 500 },
  );
}
