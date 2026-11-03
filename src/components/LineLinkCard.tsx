"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlinkMyLineAction } from "@/lib/data/line-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export function LineLinkCard({
  linked,
  lineDisplayName,
  staffCode,
}: {
  linked: boolean;
  lineDisplayName: string | null;
  staffCode: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader title="LINE 連携" subtitle="連携すると、あなたの担当清掃が LINE に届きます。" />
      <CardBody className="space-y-3 text-sm">
        {linked ? (
          <>
            <p className="font-bold text-emerald-700">
              連携済み{lineDisplayName ? `（${lineDisplayName}）` : ""}
            </p>
            {msg ? <Alert tone="success">{msg}</Alert> : null}
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await unlinkMyLineAction();
                  if (res.ok) {
                    setMsg("連携を解除しました");
                    router.refresh();
                  } else setMsg(res.error);
                })
              }
            >
              連携を解除
            </Button>
          </>
        ) : (
          <>
            <p className="text-slate-600">未連携です。次のいずれかで連携できます。</p>
            <ol className="list-decimal space-y-1 pl-5 text-slate-600">
              <li>店舗の清掃管理 LINE 公式アカウントを友だち追加</li>
              <li>
                トーク画面のボタンから「スタッフ登録」を開き、自分の名前を選択
                {staffCode ? (
                  <>
                    、または管理者から受け取ったコード{" "}
                    <code className="rounded bg-slate-100 px-1 font-bold tracking-widest">
                      {staffCode}
                    </code>{" "}
                    を送信
                  </>
                ) : null}
              </li>
            </ol>
          </>
        )}
      </CardBody>
    </Card>
  );
}
