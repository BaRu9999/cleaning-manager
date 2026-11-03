"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/guard";
import { distinctDates, distinctNames, parseTanitaShiftCsv } from "@/lib/shift/tanita";
import { NEW_STAFF_SENTINEL, resolveShiftNames, type StaffOption } from "./shift-import";
import { replaceDailyStaffingForDate } from "./staffing-actions";
import { fail, ok, toMessage, type ActionResult } from "./result";

export interface ShiftPreviewEntry {
  name: string;
  positions: string[];
  startTime: string | null;
  endTime: string | null;
  matchedUserId: string | null;
}

export interface ShiftPreviewDate {
  date: string;
  entries: ShiftPreviewEntry[];
}

export interface ShiftImportPreview {
  rowCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  dates: ShiftPreviewDate[];
  unmatchedNames: string[];
  staffOptions: StaffOption[];
}

/** CSVを解析し、氏名を解決した上でプレビューを返す（DB書き込みは行わない） */
export async function previewShiftImportAction(
  csvText: string,
): Promise<ActionResult<ShiftImportPreview>> {
  try {
    await assertAdmin();
    const { entries, error } = parseTanitaShiftCsv(csvText);
    if (error) return fail(error);
    if (entries.length === 0) return fail("取り込める行がありませんでした");

    const supabase = await createClient();
    const names = distinctNames(entries);
    const { resolved, unmatched, staffOptions } = await resolveShiftNames(supabase, names);

    const dates = distinctDates(entries);
    const byDate: ShiftImportPreview["dates"] = dates.map((date) => ({
      date,
      entries: entries
        .filter((e) => e.date === date)
        .map((e) => ({
          name: e.name,
          positions: e.positions,
          startTime: e.startTime,
          endTime: e.endTime,
          matchedUserId: resolved.get(e.name) ?? null,
        })),
    }));

    return ok({
      rowCount: entries.length,
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
      dates: byDate,
      unmatchedNames: unmatched,
      staffOptions,
    });
  } catch (e) {
    return fail(toMessage(e));
  }
}

const confirmSchema = z.object({
  csvText: z.string().min(1),
  /** 未解決だった氏名 → 選んだ userId / NEW_STAFF_SENTINEL（新規登録）/ ""・null（スキップ） */
  aliasMap: z
    .record(
      z.string(),
      z.union([z.string().uuid(), z.literal(NEW_STAFF_SENTINEL), z.literal("")]).nullable(),
    )
    .default({}),
  filename: z.string().trim().max(200).optional().default(""),
});

export interface ShiftImportSummary {
  datesImported: number;
  staffRows: number;
  skippedNames: string[];
}

/** プレビュー確認後、実際に daily_staffing へ反映する（日付単位で全置換） */
export async function confirmShiftImportAction(
  payloadJson: string,
): Promise<ActionResult<ShiftImportSummary>> {
  try {
    const me = await assertAdmin();
    let raw: unknown;
    try {
      raw = JSON.parse(payloadJson);
    } catch {
      return fail("入力データの形式が不正です");
    }
    const parsed = confirmSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "入力エラー");
    const { csvText, aliasMap, filename } = parsed.data;

    const { entries, error } = parseTanitaShiftCsv(csvText);
    if (error) return fail(error);
    if (entries.length === 0) return fail("取り込める行がありませんでした");

    const supabase = await createClient();
    const names = distinctNames(entries);
    const { resolved, unmatched } = await resolveShiftNames(supabase, names);

    // 今回はじめて解決した名前は shift_name_aliases に記録（次回から自動解決）
    const newAliases: { alias: string; user_id: string }[] = [];
    for (const name of unmatched) {
      const chosen = aliasMap[name];
      if (!chosen) continue;
      if (chosen === NEW_STAFF_SENTINEL) {
        // ログインアカウントを持たない「シフト連携のみ」のスタッフとして新規登録
        // users.id は auth.users との紐付け前提で default が無いため、ここで明示的に発行する
        const userId = crypto.randomUUID();
        const { error: createErr } = await supabase
          .from("users")
          .insert({ id: userId, display_name: name, role: "staff", active: true, has_login: false });
        if (createErr) {
          return fail(`${name} の新規登録に失敗しました: ${createErr.message}`);
        }
        resolved.set(name, userId);
        newAliases.push({ alias: name, user_id: userId });
      } else {
        resolved.set(name, chosen);
        newAliases.push({ alias: name, user_id: chosen });
      }
    }
    if (newAliases.length > 0) {
      const { error: aliasErr } = await supabase
        .from("shift_name_aliases")
        .upsert(newAliases, { onConflict: "alias" });
      if (aliasErr) return fail(`氏名マッピングの保存に失敗しました: ${aliasErr.message}`);
    }

    const skippedNames = names.filter((n) => !resolved.has(n));
    const dates = distinctDates(entries);
    let staffRows = 0;

    for (const date of dates) {
      const dayEntries = entries.filter((e) => e.date === date);
      const staffingEntries = dayEntries
        .map((e) => {
          const userId = resolved.get(e.name);
          if (!userId) return null;
          return {
            userId,
            positions: e.positions,
            startTime: e.startTime,
            endTime: e.endTime,
            availableForCleaning: true,
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      const { error: repErr } = await replaceDailyStaffingForDate(supabase, date, staffingEntries);
      if (repErr) return fail(`${date} の反映に失敗しました: ${repErr}`);
      staffRows += staffingEntries.length;
    }

    await supabase.from("shift_import_logs").insert({
      imported_by: me.id,
      source_filename: filename || null,
      work_date_from: dates[0] ?? null,
      work_date_to: dates[dates.length - 1] ?? null,
      row_count: entries.length,
      matched_count: staffRows,
      unmatched_names: skippedNames,
    });

    revalidatePath("/admin/assignments");
    revalidatePath("/admin/shift-import");
    revalidatePath("/admin/staff");
    revalidatePath("/admin");

    return ok({ datesImported: dates.length, staffRows, skippedNames });
  } catch (e) {
    return fail(toMessage(e));
  }
}
