"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDailyStaffingAction } from "@/lib/data/staffing-actions";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

interface StaffOption {
  id: string;
  displayName: string;
  position: string | null;
}

interface StaffingRow {
  userId: string;
  positions: string[];
  startTime: string | null;
  endTime: string | null;
  availableForCleaning: boolean;
}

interface Row {
  present: boolean;
  positions: string[];
  startTime: string;
  endTime: string;
  availableForCleaning: boolean;
}

export function StaffingEditor({
  workDate,
  staffOptions,
  initial,
  positions,
}: {
  workDate: string;
  staffOptions: StaffOption[];
  initial: StaffingRow[];
  positions: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const initialMap = useMemo(() => new Map(initial.map((r) => [r.userId, r])), [initial]);

  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const out: Record<string, Row> = {};
    for (const s of staffOptions) {
      const cur = initialMap.get(s.id);
      out[s.id] = {
        present: !!cur,
        positions: cur?.positions.length ? cur.positions : s.position ? [s.position] : [],
        startTime: cur?.startTime ?? "",
        endTime: cur?.endTime ?? "",
        availableForCleaning: cur?.availableForCleaning ?? true,
      };
    }
    return out;
  });

  function patch(id: string, p: Partial<Row>) {
    setRows((r) => ({ ...r, [id]: { ...r[id]!, ...p } }));
  }

  function togglePosition(id: string, pos: string) {
    setRows((r) => {
      const cur = r[id]!;
      const has = cur.positions.includes(pos);
      return {
        ...r,
        [id]: { ...cur, positions: has ? cur.positions.filter((p) => p !== pos) : [...cur.positions, pos] },
      };
    });
  }

  const presentCount = Object.values(rows).filter((r) => r.present).length;

  function save() {
    setError(null);
    const entries = staffOptions
      .filter((s) => rows[s.id]?.present)
      .map((s) => {
        const r = rows[s.id]!;
        return {
          userId: s.id,
          positions: r.positions,
          startTime: r.startTime || null,
          endTime: r.endTime || null,
          availableForCleaning: r.availableForCleaning,
        };
      });
    startTransition(async () => {
      const res = await setDailyStaffingAction(
        JSON.stringify({ workDate, entries }),
      );
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="本日の出勤スタッフ"
        subtitle={`${workDate} ・ 出勤 ${presentCount} 名`}
        action={
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        }
      />
      <CardBody className="space-y-1">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {staffOptions.length === 0 ? (
          <p className="text-sm text-slate-400">在籍スタッフがいません。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {staffOptions.map((s) => {
              const r = rows[s.id]!;
              const open = expanded === s.id;
              return (
                <li key={s.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <label className="tap flex flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-slate-300"
                        checked={r.present}
                        onChange={(e) => patch(s.id, { present: e.target.checked })}
                      />
                      <span className="text-sm font-bold text-slate-800">{s.displayName}</span>
                      {r.present && r.positions.length > 0 ? (
                        <span className="text-[11px] font-bold text-slate-400">
                          （{r.positions.join("・")}）
                        </span>
                      ) : null}
                    </label>
                    {r.present ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : s.id)}
                        className="text-xs font-bold text-slate-400"
                      >
                        詳細{open ? " ▲" : " ▼"}
                      </button>
                    ) : null}
                  </div>
                  {r.present && open ? (
                    <div className="ml-7 mt-2 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {positions.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => togglePosition(s.id, p)}
                            className={cn(
                              "tap rounded-full border px-3 py-1 text-xs font-bold",
                              r.positions.includes(p)
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 bg-white text-slate-600",
                            )}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <input
                          type="time"
                          value={r.startTime}
                          onChange={(e) => patch(s.id, { startTime: e.target.value })}
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          aria-label="出勤時間"
                        />
                        <input
                          type="time"
                          value={r.endTime}
                          onChange={(e) => patch(s.id, { endTime: e.target.value })}
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          aria-label="退勤時間"
                        />
                        <label className="tap flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={r.availableForCleaning}
                            onChange={(e) => patch(s.id, { availableForCleaning: e.target.checked })}
                          />
                          清掃対応可
                        </label>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
