import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-100 px-4 text-center">
      <p className="text-3xl font-bold text-slate-300">404</p>
      <p className="text-sm text-slate-600">ページが見つかりませんでした。</p>
      <Link
        href="/today"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
      >
        今日の清掃へ
      </Link>
    </div>
  );
}
