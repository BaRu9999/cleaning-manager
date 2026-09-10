import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ（Client Component）用 Supabase クライアント。
 *
 * Next.js のクライアント埋め込みは `process.env.NEXT_PUBLIC_XXX` という
 * **静的参照のみ**を実値へ置換する。ここでは必ずキーを直書きすること
 * （ヘルパー関数経由の動的参照にすると本番ビルドで undefined になる）。
 *
 * NEXT_PUBLIC_ 接頭辞が付いた値だけがクライアントへ渡る。
 * SUPABASE_SERVICE_ROLE_KEY はここでは決して参照しない。
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase の公開環境変数 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) " +
        "がクライアントに読み込まれていません。.env.local を設定し、開発サーバーを再起動してください。",
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
