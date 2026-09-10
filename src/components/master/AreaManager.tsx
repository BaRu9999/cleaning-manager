"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAreaAction,
  deleteCategoryAction,
  saveAreaAction,
  saveCategoryAction,
} from "@/lib/data/area-actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { TextInput } from "@/components/ui/Field";

interface Cat {
  id: string;
  name: string;
  active: boolean;
}
interface Area {
  id: string;
  categoryId: string;
  name: string;
  active: boolean;
}

export function AreaManager({
  categories,
  areas,
}: {
  categories: Cat[];
  areas: Area[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");
  const [newArea, setNewArea] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "エラーが発生しました");
      else router.refresh();
    });
  };

  const fd = (obj: Record<string, string | boolean>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(obj)) f.set(k, typeof v === "boolean" ? (v ? "on" : "") : v);
    return f;
  };

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardBody>
          <div className="flex gap-2">
            <TextInput
              placeholder="新しいカテゴリー名"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
            <Button
              disabled={pending || !newCat.trim()}
              onClick={() =>
                run(async () => {
                  const r = await saveCategoryAction(null, fd({ name: newCat, active: true }));
                  if (r.ok) setNewCat("");
                  return r;
                })
              }
            >
              追加
            </Button>
          </div>
        </CardBody>
      </Card>

      {categories.map((c) => {
        const list = areas.filter((a) => a.categoryId === c.id);
        return (
          <Card key={c.id}>
            <CardBody className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== c.name)
                      run(() =>
                        saveCategoryAction(c.id, fd({ name: e.target.value, active: c.active })),
                      );
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base font-bold"
                />
                <button
                  onClick={() => {
                    if (confirm(`カテゴリー「${c.name}」を削除しますか？`))
                      run(() => deleteCategoryAction(c.id));
                  }}
                  className="tap rounded-md border border-red-300 px-2.5 py-1 text-xs font-bold text-red-600"
                >
                  削除
                </button>
              </div>

              <ul className="divide-y divide-slate-100">
                {list.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-1.5">
                    <input
                      defaultValue={a.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== a.name)
                          run(() =>
                            saveAreaAction(
                              a.id,
                              fd({ categoryId: c.id, name: e.target.value, active: a.active }),
                            ),
                          );
                      }}
                      className={`flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm ${
                        a.active ? "" : "text-slate-400 line-through"
                      }`}
                    />
                    <button
                      onClick={() =>
                        run(() =>
                          saveAreaAction(
                            a.id,
                            fd({ categoryId: c.id, name: a.name, active: !a.active }),
                          ),
                        )
                      }
                      className="tap rounded-md border border-slate-300 px-2 py-1 text-xs font-bold text-slate-600"
                    >
                      {a.active ? "無効" : "有効"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`「${a.name}」を削除しますか？`))
                          run(() => deleteAreaAction(a.id));
                      }}
                      className="tap rounded-md border border-red-300 px-2 py-1 text-xs font-bold text-red-600"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2 pt-1">
                <TextInput
                  placeholder="場所を追加"
                  value={newArea[c.id] ?? ""}
                  onChange={(e) => setNewArea((s) => ({ ...s, [c.id]: e.target.value }))}
                />
                <Button
                  variant="secondary"
                  disabled={pending || !(newArea[c.id] ?? "").trim()}
                  onClick={() =>
                    run(async () => {
                      const r = await saveAreaAction(
                        null,
                        fd({ categoryId: c.id, name: newArea[c.id] ?? "", active: true }),
                      );
                      if (r.ok) setNewArea((s) => ({ ...s, [c.id]: "" }));
                      return r;
                    })
                  }
                >
                  追加
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
