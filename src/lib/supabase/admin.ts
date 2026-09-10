import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "@/lib/env";

/**
 * service_role キーを使う管理用クライアント。RLS を無視する。
 * seed スクリプトと Cron（RLS を跨ぐ日次生成・通知）からのみ使用すること。
 * 絶対にブラウザへ渡さない。
 */
export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  return createSupabaseClient(url, getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
