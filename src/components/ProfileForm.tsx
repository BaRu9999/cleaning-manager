"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyProfileAction } from "@/lib/data/staff-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/Field";

export function ProfileForm({
  displayName,
  phone,
  email,
  role,
  position,
}: {
  displayName: string;
  phone: string | null;
  email: string | null;
  role: string;
  position: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(
    null,
  );

  function submit(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await updateMyProfileAction(formData);
      if (!res.ok) setMsg({ tone: "danger", text: res.error });
      else {
        setMsg({ tone: "success", text: "保存しました" });
        router.refresh();
      }
    });
  }

  return (
    <form action={submit}>
      <Card>
        <CardBody className="space-y-3">
          <Field label="表示名" required>
            <TextInput name="displayName" defaultValue={displayName} required />
          </Field>
          <Field label="電話番号（任意）">
            <TextInput name="phone" type="tel" defaultValue={phone ?? ""} />
          </Field>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p>メール: {email ?? "—"}</p>
            <p>権限: {role === "admin" ? "管理者" : "スタッフ"}（変更は管理者のみ）</p>
            <p>担当ポジション: {position ?? "未設定"}（変更は管理者のみ）</p>
          </div>
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </CardBody>
      </Card>
    </form>
  );
}
