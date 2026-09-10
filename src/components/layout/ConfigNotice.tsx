import { Alert } from "@/components/ui/Alert";

/** Supabase 未設定 / DB 未マイグレーション時に画面全体へ出す案内 */
export function ConfigNotice({ kind }: { kind: "env" | "db" }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      {kind === "env" ? (
        <Alert tone="warning" title="Supabase が未設定です">
          <p>
            <code className="text-xs">.env.local</code> に{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> と{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            を設定し、開発サーバーを再起動してください。
          </p>
          <p className="mt-2 text-xs">
            手順は <code className="text-xs">README.md</code> の「Supabase設定」を参照。
          </p>
        </Alert>
      ) : (
        <Alert tone="warning" title="データベースの初期化が必要です">
          <p>
            Supabase の SQL Editor で{" "}
            <code className="text-xs">supabase/migrations/0001_init.sql</code> と{" "}
            <code className="text-xs">0002_storage.sql</code> を実行してください。
          </p>
        </Alert>
      )}
    </div>
  );
}
