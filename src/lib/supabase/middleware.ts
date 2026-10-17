import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv, hasSupabaseEnv } from "@/lib/env";
import { AUTH_USER_EMAIL_HEADER, AUTH_USER_ID_HEADER } from "./auth-headers";

// LIFF 配下は LINE トークンで認証するため Supabase セッション不要
const PUBLIC_PREFIXES = ["/login", "/auth", "/api/auth", "/liff"];

/**
 * すべてのリクエストで Supabase セッションを更新し、未ログインで保護ページに
 * アクセスした場合は /login へリダイレクトする。
 * `/api/cron/*` はセッション不要（CRON_SECRET で保護）なので matcher で除外している。
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // 環境変数が未設定でもビルド/プレビューを止めない（保護はページ側でも実施）
  if (!hasSupabaseEnv()) {
    return response;
  }

  const { url, anonKey } = getSupabasePublicEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 検証済みユーザーを後続の Server Component / Server Action へヘッダーで引き継ぐ。
  // 無ければ確実に削除する（クライアントが同名ヘッダーを送っても常にここで上書き/削除されるため、
  // なりすましは成立しない）。
  if (user) {
    request.headers.set(AUTH_USER_ID_HEADER, user.id);
    request.headers.set(AUTH_USER_EMAIL_HEADER, user.email ?? "");
  } else {
    request.headers.delete(AUTH_USER_ID_HEADER);
    request.headers.delete(AUTH_USER_EMAIL_HEADER);
  }
  response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/today";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
