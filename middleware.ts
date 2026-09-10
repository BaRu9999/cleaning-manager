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
     * - api/cron/*（CRON_SECRET で保護。セッション更新不要）
     */
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
