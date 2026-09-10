"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PHOTO_REQUIREMENTS,
  PHOTO_REQUIREMENT_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  type PhotoRequirement,
  type Priority,
} from "@/config/constants";
import { saveMasterAction } from "@/lib/data/master-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Checkbox, Field, Select, Textarea, TextInput } from "@/components/ui/Field";
import { ScheduleEditor } from "./ScheduleEditor";
import {
  newScheduleDraft,
  type MasterFormInitial,
  type MasterFormOptions,
  type ScheduleDraft,
} from "./types";

function parseDaysOfMonth(text: string): number[] {
  return text
    .split(/[,、\s]+/)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
}

export function MasterForm({
  initial,
  options,
}: {
  initial: MasterFormInitial | null;
  options: MasterFormOptions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [areaId, setAreaId] = useState(initial?.areaId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [method, setMethod] = useState(initial?.method ?? "");
  const [supplies, setSupplies] = useState(initial?.supplies ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initial?.estimatedMinutes != null ? String(initial.estimatedMinutes) : "",
  );
  const [position, setPosition] = useState(initial?.position ?? "");
  const [defaultAssigneeId, setDefaultAssigneeId] = useState(
    initial?.defaultAssigneeId ?? "",
  );
  const [photoRequirement, setPhotoRequirement] = useState<PhotoRequirement>(
    initial?.photoRequirement ?? "optional",
  );
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "normal");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(
    initial?.schedules?.length ? initial.schedules : [newScheduleDraft()],
  );

  const filteredAreas = useMemo(
    () =>
      categoryId
        ? options.areas.filter((a) => a.categoryId === categoryId)
        : options.areas,
    [categoryId, options.areas],
  );

  function onAreaChange(next: string) {
    setAreaId(next);
    const area = options.areas.find((a) => a.id === next);
    if (area) setCategoryId(area.categoryId);
  }

  function onCategoryChange(next: string) {
    setCategoryId(next);
    if (areaId) {
      const area = options.areas.find((a) => a.id === areaId);
      if (area && area.categoryId !== next) setAreaId("");
    }
  }

  function submit() {
    setError(null);
    const payload = {
      name: name.trim(),
      areaId: areaId || null,
      categoryId: categoryId || null,
      description: description.trim() || null,
      method: method.trim() || null,
      supplies: supplies.trim() || null,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      position: position.trim() || null,
      defaultAssigneeId: defaultAssigneeId || null,
      photoRequirement,
      priority,
      notes: notes.trim() || null,
      active,
      schedules: schedules.map((s) => ({
        ...(s.id ? { id: s.id } : {}),
        frequency: s.frequency,
        weekdays: s.weekdays,
        daysOfMonth: parseDaysOfMonth(s.daysOfMonthText),
        intervalDays: s.intervalDays,
        anchorDate: s.anchorDate,
        timeSlot: s.timeSlot,
        fixedTime: s.fixedTime,
        dueTime: s.dueTime,
        active: s.active,
      })),
    };

    if (!payload.name) {
      setError("清掃名は必須です");
      return;
    }

    startTransition(async () => {
      const res = await saveMasterAction(initial?.id ?? null, JSON.stringify(payload));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/admin/master");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="基本情報" />
        <CardBody className="space-y-3">
          <Field label="清掃名" required>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="冷蔵庫取手の清掃"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="カテゴリー">
              <Select value={categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
                <option value="">未選択</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="清掃場所">
              <Select value={areaId} onChange={(e) => onAreaChange(e.target.value)}>
                <option value="">未選択</option>
                {filteredAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="清掃内容">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="取手・扉の縁を除菌シートで拭く"
            />
          </Field>
          <Field label="清掃方法">
            <Textarea
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="アルコールを噴霧しマイクロファイバークロスで拭き上げる"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="使用する洗剤・備品">
              <TextInput
                value={supplies}
                onChange={(e) => setSupplies(e.target.value)}
                placeholder="アルコール、クロス"
              />
            </Field>
            <Field label="所要時間の目安（分）">
              <TextInput
                inputMode="numeric"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="3"
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="担当・写真・優先度" />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="担当ポジション">
              <Select value={position} onChange={(e) => setPosition(e.target.value)}>
                <option value="">指定なし</option>
                {options.positions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="担当スタッフ（既定）">
              <Select
                value={defaultAssigneeId}
                onChange={(e) => setDefaultAssigneeId(e.target.value)}
              >
                <option value="">指定なし（ポジション全員）</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                    {u.position ? `（${u.position}）` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="写真">
              <Select
                value={photoRequirement}
                onChange={(e) =>
                  setPhotoRequirement(e.target.value as PhotoRequirement)
                }
              >
                {PHOTO_REQUIREMENTS.map((p) => (
                  <option key={p} value={p}>
                    {PHOTO_REQUIREMENT_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="優先度">
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="備考">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Checkbox
            label="有効（無効にすると今後のタスク生成から外れます）"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="実施スケジュール"
          subtitle="1つの清掃項目に複数のスケジュールを設定できます（例: 毎日 + 毎週金曜の念入り）。"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSchedules((s) => [...s, newScheduleDraft()])}
            >
              ＋ 追加
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {schedules.length === 0 ? (
            <p className="text-sm text-slate-500">
              スケジュールがありません。「追加」で設定してください（未設定だと自動生成されません）。
            </p>
          ) : (
            schedules.map((s, i) => (
              <ScheduleEditor
                key={s.key}
                index={i}
                value={s}
                timeSlots={options.timeSlots}
                onChange={(next) =>
                  setSchedules((arr) => arr.map((x) => (x.key === s.key ? next : x)))
                }
                onRemove={() =>
                  setSchedules((arr) => arr.filter((x) => x.key !== s.key))
                }
              />
            ))
          )}
        </CardBody>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="sticky bottom-16 z-10 flex gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-0">
        <Button
          variant="secondary"
          onClick={() => router.push("/admin/master")}
          disabled={pending}
        >
          キャンセル
        </Button>
        <Button className="flex-1" onClick={submit} disabled={pending}>
          {pending ? "保存中…" : initial ? "変更を保存" : "登録する"}
        </Button>
      </div>
    </div>
  );
}
