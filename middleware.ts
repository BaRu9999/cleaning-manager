import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 次を除く全パスにマッチ:
     * - _next/static, _next/image
     * - favicon.ico, 画像ファイル
     * - api/cron/*（CRON_SECRET）・api/line/*（LINE 署名）・api/liff/*（LINE トークン検証）で保護。
     *   いずれも Cookie セッション不要
     */
    "/((?!_next/static|_next/image|favicon.ico|api/cron|api/line|api/liff|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
