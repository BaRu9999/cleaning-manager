"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendTestSlackAction,
  updateNotificationSettingsAction,
} from "@/lib/data/notification-actions";
import type { NotificationSettings } from "@/lib/types/domain";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Checkbox, Field, TextInput } from "@/components/ui/Field";

export function NotificationSettingsForm({
  initial,
}: {
  initial: NotificationSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(
    null,
  );

  function submit(formData: FormData) {
    setMsg(null);
    startTransition(async () => {
      const res = await updateNotificationSettingsAction(formData);
      if (!res.ok) setMsg({ tone: "danger", text: res.error });
      else {
        setMsg({ tone: "success", text: "保存しました" });
        router.refresh();
      }
    });
  }

  function test() {
    setMsg(null);
    startTransition(async () => {
      const res = await sendTestSlackAction();
      setMsg(
        res.ok
          ? { tone: "success", text: "Slack にテスト通知を送信しました" }
          : { tone: "danger", text: res.error },
      );
    });
  }

  return (
    <form action={submit}>
      <Card>
        <CardBody className="space-y-4">
          <Checkbox
            name="slackEnabled"
            defaultChecked={initial.slackEnabled}
            label="Slack 通知を有効にする"
          />
          <Field
            label="Incoming Webhook URL"
            hint="Slack アプリの Incoming Webhooks で発行。https://hooks.slack.com/services/... 形式。"
          >
            <TextInput
              name="slackWebhookUrl"
              type="url"
              defaultValue={initial.slackWebhookUrl ?? ""}
              placeholder="https://hooks.slack.com/services/XXX/YYY/ZZZ"
            />
          </Field>

          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">送信する通知</p>
            <Checkbox
              name="notifyDailyPlan"
              defaultChecked={initial.notifyDailyPlan}
              label="本日の清掃予定（朝 8:00）"
            />
            <Checkbox
              name="notifyOverdue"
              defaultChecked={initial.notifyOverdue}
              label="清掃未実施（期限超過を検知したとき）"
            />
            <Checkbox
              name="notifyClosingSummary"
              defaultChecked={initial.notifyClosingSummary}
              label="本日の清掃結果（夜 23:00）"
            />
          </div>

          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={test} disabled={pending}>
              テスト送信
            </Button>
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>

          <p className="text-xs text-slate-400">
            最終送信: 予定 {initial.lastDailyPlanOn ?? "—"} / 結果{" "}
            {initial.lastClosingSummaryOn ?? "—"}
          </p>
        </CardBody>
      </Card>
    </form>
  );
}
