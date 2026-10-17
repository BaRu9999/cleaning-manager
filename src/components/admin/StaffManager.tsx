"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  JOB_TITLES,
  JOB_TITLE_LABELS,
  ROLE_LABELS,
  ROLES,
} from "@/config/constants";
import { cn } from "@/lib/cn";
import {
  setStaffActiveAction,
  setStaffCodeAction,
  setStaffJobTitleAction,
  setStaffPositionAction,
  setStaffRoleAction,
  setStaffVisibleCategoriesAction,
} from "@/lib/data/staff-actions";
import { Alert } from "@/components/ui/Alert";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";

interface StaffRow {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  jobTitle: string;
  position: string | null;
  active: boolean;
  staffCode: string | null;
  visibleCategoryIds: string[] | null;
  lineLinked: boolean;
  hasLogin: boolean;
  todayAssigned: number;
  todayDone: number;
}

export function StaffManager({
  staff,
  positions,
  categories,
  meId,
}: {
  staff: StaffRow[];
  positions: string[];
  categories: { id: string; name: string }[];
  meId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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
  // シフト連携のみ（ログイン不可）のスタッフは LINE 通知の対象外なので未連携カウントに含めない
  const unlinked = activeStaff.filter((s) => s.hasLogin && !s.lineLinked).length;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {unlinked > 0 ? (
        <Alert tone="warning">
          LINE 未連携のスタッフが <b>{unlinked}名</b> います（通知が届きません）。
        </Alert>
      ) : null}

      {waiting.length > 0 ? (
        <Card>
          <CardBody>
            <p className="mb-2 text-sm font-bold text-amber-700">承認待ち（{waiting.length}）</p>
            <ul className="space-y-2">
              {waiting.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-800">{s.displayName}</div>
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
            {activeStaff.map((s) => {
              const isSelf = s.id === meId;
              const open = expanded === s.id;
              return (
                <li key={s.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-800">{s.displayName}</span>
                        {isSelf ? <span className="text-xs text-slate-400">（自分）</span> : null}
                        {s.hasLogin ? (
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-bold",
                              s.lineLinked
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700",
                            )}
                          >
                            {s.lineLinked ? "LINE連携済" : "LINE未連携"}
                          </span>
                        ) : (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            シフト連携のみ
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        本日の担当 {s.todayAssigned}件 ・ 完了 {s.todayDone}/{s.todayAssigned}
                      </div>
                    </div>
                    <button
                      disabled={pending || isSelf}
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
                      value={s.jobTitle}
                      disabled={pending}
                      onChange={(e) => run(() => setStaffJobTitleAction(s.id, e.target.value))}
                    >
                      {JOB_TITLES.map((j) => (
                        <option key={j} value={j}>
                          {JOB_TITLE_LABELS[j]}
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

                  <div className="mt-2 flex items-center gap-2">
                    <Select
                      value={s.role}
                      disabled={pending || isSelf || !s.hasLogin}
                      onChange={(e) => run(() => setStaffRoleAction(s.id, e.target.value))}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          権限：{ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : s.id)}
                      className="tap shrink-0 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-600"
                    >
                      詳細{open ? " ▲" : " ▼"}
                    </button>
                  </div>

                  {open ? (
                    <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-2.5">
                      {s.hasLogin ? (
                        <div>
                          <p className="mb-1 text-xs font-bold text-slate-500">
                            LINE 連携コード（LIFF が使えないスタッフ用。LINE でこのコードを送信）
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="rounded border border-slate-300 bg-white px-2 py-1 text-sm font-bold tracking-widest">
                              {s.staffCode ?? "未発行"}
                            </code>
                            <button
                              disabled={pending}
                              onClick={() => run(() => setStaffCodeAction(s.id, "issue"))}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600"
                            >
                              {s.staffCode ? "再発行" : "発行"}
                            </button>
                            {s.staffCode ? (
                              <button
                                disabled={pending}
                                onClick={() => run(() => setStaffCodeAction(s.id, "clear"))}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-500"
                              >
                                失効
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          シフトCSV連携で自動登録されたスタッフです。アプリへのログインや LINE
                          通知の対象にはなりません（出勤登録・清掃の自動割当のみに使われます）。
                        </p>
                      )}

                      <div>
                        <p className="mb-1 text-xs text-slate-500">
                          閲覧カテゴリー（未選択＝役職の既定範囲。一般スタッフは常に自分の担当のみ）
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {categories.map((c) => {
                            const on = (s.visibleCategoryIds ?? []).includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                disabled={pending}
                                onClick={() => {
                                  const cur = new Set(s.visibleCategoryIds ?? []);
                                  if (cur.has(c.id)) cur.delete(c.id);
                                  else cur.add(c.id);
                                  run(() => setStaffVisibleCategoriesAction(s.id, [...cur]));
                                }}
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-xs font-bold",
                                  on
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 bg-white text-slate-600",
                                )}
                              >
                                {c.name}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                setStaffVisibleCategoriesAction(s.id, categories.map((c) => c.id)),
                              )
                            }
                            className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700"
                          >
                            全カテゴリー
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => setStaffVisibleCategoriesAction(s.id, []))}
                            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-500"
                          >
                            既定に戻す
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
