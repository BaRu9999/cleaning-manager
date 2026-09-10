import { redirect } from "next/navigation";
import { getProfile, getSessionUser } from "@/lib/auth/guard";
import { Alert } from "@/components/ui/Alert";

export const dynamic = "force-dynamic";

/** 新規登録したが管理者にまだ承認されていないユーザー向けの待機画面 */
export default async function PendingPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const profile = await getProfile();
  if (profile?.active) redirect("/today");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-lg font-bold text-slate-800">利用承認待ち</h1>
        <Alert tone="info" title={`${profile?.displayName ?? session.email} さん`}>
          アカウントは作成されました。店舗の管理者があなたの利用を承認すると、
          清掃タスクの確認・完了登録ができるようになります。
          <br />
          承認後にこのページを再読み込みしてください。
        </Alert>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full rounded-lg border border-slate-300 bg-white py-3 text-sm font-bold text-slate-700"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
