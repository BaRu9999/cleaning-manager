import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "@/lib/env";

/**
 * サーバー（Server Component / Route Handler / Server Action）用 Supabase クライアント。
 * Cookie 経由でユーザーセッションを引き継ぐため RLS がそのまま効く。
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component から呼ばれた場合は set 不可。
          // middleware がセッションを更新するため無視して問題ない。
        }
      },
    },
  });
}
