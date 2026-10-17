/**
 * middleware（`updateSession`）が検証済みの Supabase user を、後続の Server Component /
 * Server Action へリクエストヘッダー経由で引き継ぐためのキー。
 * `guard.ts` の `getSessionUser()` はこのヘッダーがあれば `supabase.auth.getUser()`
 * （Supabase Auth サーバーへの往復）を省略する。
 *
 * 安全性: このヘッダーは middleware が検証済みの `user` から常に上書き/削除するため、
 * クライアントが同名ヘッダーを送っても無視される（なりすまし不可）。
 * ヘッダーが無い場合（matcher対象外のパス等）は guard.ts 側が
 * `supabase.auth.getUser()` にフォールバックするため、安全性は変わらない。
 */
export const AUTH_USER_ID_HEADER = "x-scm-auth-user-id";
export const AUTH_USER_EMAIL_HEADER = "x-scm-auth-user-email";
