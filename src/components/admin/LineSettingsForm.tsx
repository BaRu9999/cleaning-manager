"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  JOB_TITLES,
  JOB_TITLE_LABELS,
  LINE_NOTIFY_TYPES,
  LINE_NOTIFY_TYPE_LABELS,
  type JobTitle,
  type LineNotifyType,
} from "@/config/constants";
import {
  sendTestLineAction,
  updateLineSettingsAction,
} from "@/lib/data/notification-actions";
import type { NotificationSettings } from "@/lib/types/domain";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Checkbox, Field, TextInput } from "@/components/ui/Field";

export function LineSettingsForm({
  initial,
  hasEnvToken,
}: {
  initial: NotificationSettings;
  hasEnvToken: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const [enabled, setEnabled] = useState(initial.lineEnabled);
  const [token, setToken] = useState(initial.lineChannelAccessToken ?? "");
  const [secret, setSecret] = useState(initial.lineChannelSecret ?? "");
  const [morningTime, setMorningTime] = useState(initial.lineMorningTime);
  const [progressTimes, setProgressTimes] = useState(initial.lineProgressTimes.join(", "));
  const [offsets, setOffsets] = useState(initial.lineReminderOffsets.join(", "));
  const [closingTime, setClosingTime] = useState(initial.lineClosingTime);
  const [prefs, setPrefs] = useState(initial.lineRolePrefs);

  function toggle(job: JobTitle, type: LineNotifyType) {
    setPrefs((p) => ({ ...p, [job]: { ...p[job], [type]: !p[job][type] } }));
  }

  function submit() {
    setMsg(null);
    const payload = {
      lineEnabled: enabled,
      lineChannelAccessToken: token.trim(),
      lineChannelSecret: secret.trim(),
      lineMorningTime: morningTime,
      lineProgressTimes: progressTimes
        .split(/[,、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      lineReminderOffsets: offsets
        .split(/[,、\s]+/)
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n)),
      lineClosingTime: closingTime,
      lineRolePrefs: prefs,
    };
    startTransition(async () => {
      const res = await updateLineSettingsAction(JSON.stringify(payload));
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
      const res = await sendTestLineAction();
      setMsg(
        res.ok
          ? { tone: "success", text: "あなたの LINE にテスト送信しました" }
          : { tone: "danger", text: res.error },
      );
    });
  }

  return (
    <Card>
      <CardHeader
        title="LINE 通知設定"
        subtitle="担当スタッフ本人へ個別に、役職に応じて内容を出し分けて配信します。送信はサーバー側の Cron から行われます。"
      />
      <CardBody className="space-y-4">
        <Checkbox
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          label="LINE 通知を有効にする"
        />

        <Field
          label="チャネルアクセストークン"
          hint={
            hasEnvToken
              ? "env の LINE_CHANNEL_ACCESS_TOKEN 設定済み（env 優先。ここは空でOK）"
              : "LINE Developers → Messaging API チャネル → 長期アクセストークン"
          }
        >
          <TextInput
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasEnvToken ? "（env を使用中）" : ""}
          />
        </Field>
        <Field label="チャネルシークレット" hint="Webhook 署名検証用。env の LINE_CHANNEL_SECRET 優先。">
          <TextInput type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </Field>

        <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
          <Field label="朝の清掃予定 時刻" hint="この時刻±15分に配信">
            <TextInput type="time" value={morningTime} onChange={(e) => setMorningTime(e.target.value)} />
          </Field>
          <Field label="途中進捗 時刻" hint="カンマ区切りで複数可（例 15:00, 18:00）">
            <TextInput value={progressTimes} onChange={(e) => setProgressTimes(e.target.value)} />
          </Field>
          <Field label="閉店後レポート 時刻">
            <TextInput type="time" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
          </Field>
        </div>

        <Field
          label="未実施通知のタイミング（期限からの分。負=前 / 0=時刻 / 正=後）"
          hint="例: -30, 0, 30 で「期限30分前・期限時刻・期限30分後」"
        >
          <TextInput value={offsets} onChange={(e) => setOffsets(e.target.value)} />
        </Field>

        <div>
          <p className="mb-2 text-sm font-bold text-slate-700">役職ごとの通知 ON / OFF</p>
          <div className="scroll-x">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="p-2">役職</th>
                  {LINE_NOTIFY_TYPES.map((t) => (
                    <th key={t} className="p-2 text-center font-bold">
                      {LINE_NOTIFY_TYPE_LABELS[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {JOB_TITLES.map((job) => (
                  <tr key={job} className="border-t border-slate-100">
                    <td className="p-2 font-bold text-slate-700">{JOB_TITLE_LABELS[job]}</td>
                    {LINE_NOTIFY_TYPES.map((t) => (
                      <td key={t} className="p-2 text-center">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-slate-300"
                          checked={prefs[job][t]}
                          onChange={() => toggle(job, t)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
            <li>朝の清掃予定: 一般スタッフ=自分の担当だけ / リーダー・店長=全体スケジュール（担当・期限・状態）</li>
            <li>途中進捗: 予定/完了/未実施/完了率 ＋ 未実施一覧（担当・期限）</li>
            <li>未実施・期限超過: 担当者本人＋受信 ON の役職へ。リーダー・店長はスコープ内をまとめて1通</li>
            <li>担当者本人 かつ リーダー でも二重送信しません（全体スケジュール1通に集約）</li>
          </ul>
        </div>

        {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={test} disabled={pending}>
            自分にテスト送信
          </Button>
          <Button type="button" className="flex-1" onClick={submit} disabled={pending}>
            {pending ? "保存中…" : "LINE 設定を保存"}
          </Button>
        </div>

        <p className="text-xs text-slate-400">
          最終送信: 朝 {initial.lastLineMorningOn ?? "—"} / 進捗{" "}
          {initial.lastLineProgressAt?.slice(0, 16).replace("T", " ") ?? "—"} / 閉店{" "}
          {initial.lastLineClosingOn ?? "—"}
        </p>
      </CardBody>
    </Card>
  );
}
