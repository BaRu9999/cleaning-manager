"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TIME_SLOT_LABELS, type TimeSlotKey } from "@/config/constants";
import { updateStoreSettingsAction } from "@/lib/data/settings-actions";
import type { StoreSettings, TimeSlotConfig } from "@/lib/types/domain";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Textarea, TextInput } from "@/components/ui/Field";

export function StoreSettingsForm({ initial }: { initial: StoreSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(
    null,
  );

  const [storeName, setStoreName] = useState(initial.storeName);
  const [openTime, setOpenTime] = useState(initial.openTime);
  const [closeTime, setCloseTime] = useState(initial.closeTime);
  const [slots, setSlots] = useState<TimeSlotConfig[]>(initial.timeSlots);
  const [positionsText, setPositionsText] = useState(initial.positions.join("\n"));

  function setSlot(key: TimeSlotKey, patch: Partial<TimeSlotConfig>) {
    setSlots((arr) => arr.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function submit() {
    setMsg(null);
    const positions = positionsText
      .split(/[\n,、]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      storeName: storeName.trim(),
      openTime,
      closeTime,
      timeSlots: slots.map((s) => ({
        key: s.key,
        label: s.label.trim() || TIME_SLOT_LABELS[s.key],
        start: s.key === "fixed_time" ? null : s.start || null,
        end: s.key === "fixed_time" ? null : s.end || null,
      })),
      positions,
    };
    startTransition(async () => {
      const res = await updateStoreSettingsAction(JSON.stringify(payload));
      if (!res.ok) setMsg({ tone: "danger", text: res.error });
      else {
        setMsg({ tone: "success", text: "保存しました" });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="店舗" />
        <CardBody className="space-y-3">
          <Field label="店名" required>
            <TextInput value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="開店時刻">
              <TextInput type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
            </Field>
            <Field label="閉店時刻">
              <TextInput type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="清掃時間帯"
          subtitle="ラベルと時刻を店舗に合わせて変更できます。期限時刻を空欄にした清掃はこの終了時刻が期限になります。"
        />
        <CardBody className="space-y-2">
          {slots.map((s) => (
            <div
              key={s.key}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-slate-200 p-2"
            >
              <input
                value={s.label}
                onChange={(e) => setSlot(s.key, { label: e.target.value })}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-bold"
              />
              {s.key === "fixed_time" ? (
                <span className="col-span-2 text-xs text-slate-400">
                  各清掃で個別の時刻を指定
                </span>
              ) : (
                <>
                  <input
                    type="time"
                    value={s.start ?? ""}
                    onChange={(e) => setSlot(s.key, { start: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="time"
                    value={s.end ?? ""}
                    onChange={(e) => setSlot(s.key, { end: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="担当ポジション" subtitle="1行1つ。清掃項目の担当ポジション・スタッフの担当で使います。" />
        <CardBody>
          <Textarea
            rows={5}
            value={positionsText}
            onChange={(e) => setPositionsText(e.target.value)}
            placeholder={"ホール\nキッチン\nバックヤード"}
          />
        </CardBody>
      </Card>

      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}

      <Button size="lg" onClick={submit} disabled={pending}>
        {pending ? "保存中…" : "設定を保存"}
      </Button>
    </div>
  );
}
