import { APP_NAME } from "@/config/constants";
import { hasSupabaseEnv } from "@/lib/env";
import { Alert } from "@/components/ui/Alert";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configured = hasSupabaseEnv();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-bold text-slate-800">{APP_NAME}</h1>
        <p className="mb-4 mt-1 text-center text-sm text-slate-500">
          店舗の定期清掃を「いつ・どこを・誰が」で管理
        </p>

        {configured ? (
          <LoginForm />
        ) : (
          <Alert tone="warning" title="Supabase が未設定です">
            <code className="text-xs">.env.local</code> に{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> と{" "}
            <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            を設定してから再読み込みしてください。詳細は README を参照。
          </Alert>
        )}
      </div>
    </div>
  );
}
