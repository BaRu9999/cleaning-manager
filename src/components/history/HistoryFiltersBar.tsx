"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";

export interface FilterOptions {
  users: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  areas: { id: string; name: string; categoryId: string }[];
  masters: { id: string; name: string }[];
}

export interface FilterValues {
  from: string;
  to: string;
  completedById: string;
  categoryId: string;
  areaId: string;
  masterId: string;
  status: string;
  q: string;
}

export function HistoryFiltersBar({
  options,
  initial,
}: {
  options: FilterOptions;
  initial: FilterValues;
}) {
  const router = useRouter();
  const [v, setV] = useState<FilterValues>(initial);

  const set = (patch: Partial<FilterValues>) => setV((s) => ({ ...s, ...patch }));

  const areas = v.categoryId
    ? options.areas.filter((a) => a.categoryId === v.categoryId)
    : options.areas;

  function apply() {
    const params = new URLSearchParams();
    for (const [k, val] of Object.entries(v)) {
      if (val) params.set(k, val);
    }
    router.push(`/history?${params.toString()}`);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="開始日">
          <TextInput
            type="date"
            value={v.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </Field>
        <Field label="終了日">
          <TextInput
            type="date"
            value={v.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </Field>
        <Field label="状態">
          <Select value={v.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">すべて</option>
            <option value="done">完了</option>
            <option value="not_done">未実施（未実施・期限超過・スキップ）</option>
            <option value="overdue">期限超過のみ</option>
            <option value="skipped">スキップのみ</option>
          </Select>
        </Field>
        <Field label="実施スタッフ">
          <Select
            value={v.completedById}
            onChange={(e) => set({ completedById: e.target.value })}
          >
            <option value="">すべて</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="カテゴリー">
          <Select
            value={v.categoryId}
            onChange={(e) => set({ categoryId: e.target.value, areaId: "" })}
          >
            <option value="">すべて</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="清掃場所">
          <Select value={v.areaId} onChange={(e) => set({ areaId: e.target.value })}>
            <option value="">すべて</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="清掃項目">
          <Select value={v.masterId} onChange={(e) => set({ masterId: e.target.value })}>
            <option value="">すべて</option>
            {options.masters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="キーワード（清掃名）">
          <TextInput
            value={v.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="冷蔵庫"
          />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={() => router.push("/history")}>
          クリア
        </Button>
        <Button className="flex-1" onClick={apply}>
          検索
        </Button>
      </div>
    </div>
  );
}
