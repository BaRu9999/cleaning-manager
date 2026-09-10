/**
 * 環境変数アクセス。
 *
 * 重要: Next.js はクライアントバンドルへ環境変数を埋め込む際、
 * **静的な `process.env.NEXT_PUBLIC_XXX` という記述のみ**を実値へ置換する。
 * `process.env[key]` のような動的参照はブラウザでは undefined になるため使わない。
 *
 * また import 時には検証しない（ビルド・テストが env 無しでも落ちないように）。
 * 実際に必要になったリクエスト処理の中で getter を呼び、欠けていれば分かりやすい
 * エラーを投げる。秘密情報はソースへ直書きしない。
 */

export class EnvError extends Error {
  constructor(key: string, hint?: string) {
    super(
      `環境変数 ${key} が設定されていません。` +
        (hint ? ` ${hint}` : " .env.local を確認し、開発サーバーを再起動してください。"),
    );
    this.name = "EnvError";
  }
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** クライアント・サーバー両方で使う公開 Supabase 設定（静的参照） */
export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!nonEmpty(url)) {
    throw new EnvError(
      "NEXT_PUBLIC_SUPABASE_URL",
      "Supabase プロジェクトの API 設定から取得できます。設定後は開発サーバーを再起動してください。",
    );
  }
  if (!nonEmpty(anonKey)) {
    throw new EnvError("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anonKey };
}

/** Supabase 公開設定が存在するか（例外を投げずに判定 / 静的参照） */
export function hasSupabaseEnv(): boolean {
  return (
    nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/** サーバー専用: service role key（admin クライアント / seed / cron のみ） */
export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!nonEmpty(key)) {
    throw new EnvError(
      "SUPABASE_SERVICE_ROLE_KEY",
      "サーバー専用キーです。クライアントに渡さないでください。",
    );
  }
  return key;
}

/** Cron 認証シークレット（未設定なら null → Cron は 401 を返す） */
export function getCronSecret(): string | null {
  const value = process.env.CRON_SECRET;
  return nonEmpty(value) ? value : null;
}

/** .env の SLACK_WEBHOOK_URL（初期値 / フォールバック。通常は DB 設定を優先） */
export function getSlackWebhookFromEnv(): string | null {
  const value = process.env.SLACK_WEBHOOK_URL;
  return nonEmpty(value) ? value : null;
}

export function getSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  return nonEmpty(value) ? value.replace(/\/$/, "") : "http://localhost:3000";
}
