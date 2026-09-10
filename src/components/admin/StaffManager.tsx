"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, ROLES } from "@/config/constants";
import {
  setStaffActiveAction,
  setStaffPositionAction,
  setStaffRoleAction,
} from "@/lib/data/staff-actions";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";

interface StaffRow {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  position: string | null;
  active: boolean;
}

export function StaffManager({
  staff,
  positions,
  meId,
}: {
  staff: StaffRow[];
  positions: string[];
  meId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "エラー");
      else router.refresh();
    });
  };

  const waiting = staff.filter((s) => !s.active);
  const activeStaff = staff.filter((s) => s.active);

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {waiting.length > 0 ? (
        <Card>
          <CardBody>
            <p className="mb-2 text-sm font-bold text-amber-700">
              承認待ち（{waiting.length}）
            </p>
            <ul className="space-y-2">
              {waiting.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-800">
                      {s.displayName}
                    </div>
                    <div className="truncate text-xs text-slate-500">{s.email}</div>
                  </div>
                  <button
                    disabled={pending}
                    onClick={() => run(() => setStaffActiveAction(s.id, true))}
                    className="tap shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    承認
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-2">
          <p className="text-sm font-bold text-slate-600">在籍スタッフ（{activeStaff.length}）</p>
          <ul className="divide-y divide-slate-100">
            {activeStaff.map((s) => (
              <li key={s.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-slate-800">
                      {s.displayName}
                    </span>
                    {s.id === meId ? (
                      <span className="ml-1 text-xs text-slate-400">（自分）</span>
                    ) : null}
                    <div className="truncate text-xs text-slate-500">{s.email}</div>
                  </div>
                  <button
                    disabled={pending || s.id === meId}
                    onClick={() => {
                      if (confirm(`${s.displayName} を無効化しますか？`))
                        run(() => setStaffActiveAction(s.id, false));
                    }}
                    className="tap shrink-0 rounded-md border border-red-300 px-2.5 py-1 text-xs font-bold text-red-600 disabled:opacity-40"
                  >
                    無効化
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Select
                    value={s.role}
                    disabled={pending || s.id === meId}
                    onChange={(e) => run(() => setStaffRoleAction(s.id, e.target.value))}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={s.position ?? ""}
                    disabled={pending}
                    onChange={(e) => run(() => setStaffPositionAction(s.id, e.target.value))}
                  >
                    <option value="">ポジション未設定</option>
                    {positions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
