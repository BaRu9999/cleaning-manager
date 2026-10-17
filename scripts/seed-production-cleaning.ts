/**
 * 本番清掃マスタ投入スクリプト（実店舗運用向け）。
 *
 *   npm run seed:production-cleaning
 *
 * scripts/seed.ts（デモ用20件）とは別に、実店舗の清掃項目43件を投入する。
 *
 * 安全設計（本番DBの既存データを破壊しない）:
 *   - 清掃項目は `name`（清掃名）で既存行を検索し、
 *     見つかれば UPDATE（内容の再登録）、無ければ INSERT。既存の active フラグは
 *     変更しない（管理者が無効化した項目を勝手に有効化しない）。
 *   - スケジュールは対象マスタに **1件も無い場合のみ**新規投入する。
 *     既にスケジュールがある（管理画面で編集済み含む）場合は一切変更しない
 *     ＝ 再実行しても既存の運用設定を壊さない（冪等）。
 *   - 清掃場所（area）は既存タクソノミーに無ければ自動作成する（カテゴリー内で重複しない）。
 *   - 行の削除は一切行わない。
 *
 * .env* は Next.js 本体と同じ方法（@next/env）で読み込みます。
 */

import { createRequire } from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const { loadEnvConfig } = createRequire(import.meta.url)(
  "@next/env",
) as typeof import("@next/env");

loadEnvConfig(process.cwd(), true, {
  info() {},
  error(...args: unknown[]) {
    console.error(...args);
  },
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "✖ NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。",
  );
  process.exit(1);
}

console.log(`Supabase: ${SUPABASE_URL}`);
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
type Freq = "daily" | "weekly" | "monthly";
type Slot = "before_open" | "closing";
type PhotoReq = "required" | "optional";
type Prio = "normal" | "high";

interface ProdItem {
  name: string;
  category: "ホール" | "キッチン" | "バックヤード" | "その他";
  area: string;
  description?: string;
  method?: string;
  supplies?: string;
  minutes: number;
  position: "ホール" | "キッチン" | "バックヤード";
  photo?: PhotoReq;
  priority?: Prio;
  freq: Freq;
  weekdays?: number[]; // weekly のとき 0=日..6=土
  daysOfMonth?: number[]; // monthly のとき
  slot: Slot;
  dueTime: string;
}

// 衛生重要度が高い（フライヤー/製氷機/冷凍庫/グリスト/五徳/フィルター/床強化清掃）
// ものは priority=high。うち油・氷・冷凍・グリス・フィルター系は写真必須。
const ITEMS: ProdItem[] = [
  { name: "フライパンチェック", category: "キッチン", area: "コンロ", minutes: 3, position: "キッチン", freq: "daily", slot: "before_open", dueTime: "10:30", description: "焦げ付き・変形・油残りを確認し拭き上げる" },
  { name: "オーブン清掃", category: "キッチン", area: "オーブン", minutes: 15, position: "キッチン", freq: "weekly", weekdays: [2], slot: "closing", dueTime: "23:00" },
  { name: "手洗いシンク清掃", category: "キッチン", area: "シンク", minutes: 5, position: "キッチン", priority: "high", freq: "daily", slot: "closing", dueTime: "22:30", description: "石鹸カス・水垢を除去し除菌" },
  { name: "シンクオーバーフロー部清掃", category: "キッチン", area: "シンク", minutes: 10, position: "キッチン", priority: "high", freq: "weekly", weekdays: [1], slot: "closing", dueTime: "22:30" },
  { name: "ストッカー清掃", category: "バックヤード", area: "ストック棚", minutes: 10, position: "バックヤード", freq: "weekly", weekdays: [3], slot: "closing", dueTime: "23:00" },
  { name: "ダクト壁拭き", category: "キッチン", area: "壁", minutes: 10, position: "キッチン", priority: "high", freq: "monthly", daysOfMonth: [1], slot: "closing", dueTime: "23:00" },
  { name: "グリスフィルター周り拭き", category: "キッチン", area: "グリスフィルター", minutes: 15, position: "キッチン", photo: "required", priority: "high", freq: "weekly", weekdays: [4], slot: "closing", dueTime: "23:00", supplies: "油汚れ用洗剤" },
  { name: "食材棚清掃", category: "バックヤード", area: "ストック棚", minutes: 10, position: "バックヤード", freq: "weekly", weekdays: [5], slot: "closing", dueTime: "23:00" },
  { name: "ゴミ箱洗浄", category: "バックヤード", area: "ゴミ置き場", minutes: 10, position: "バックヤード", priority: "high", freq: "weekly", weekdays: [6], slot: "closing", dueTime: "23:00" },
  { name: "食器洗浄機清掃", category: "キッチン", area: "食洗機", minutes: 15, position: "キッチン", priority: "high", freq: "daily", slot: "closing", dueTime: "22:30" },
  { name: "換気口清掃", category: "キッチン", area: "換気口", minutes: 10, position: "キッチン", priority: "high", freq: "monthly", daysOfMonth: [1], slot: "closing", dueTime: "23:00" },
  { name: "フライヤー清掃・油交換", category: "キッチン", area: "フライヤー", minutes: 30, position: "キッチン", photo: "required", priority: "high", freq: "weekly", weekdays: [2], slot: "closing", dueTime: "23:00", supplies: "オイルフィルター、廃油缶" },
  { name: "シンク内清掃", category: "キッチン", area: "シンク", minutes: 10, position: "キッチン", freq: "daily", slot: "closing", dueTime: "22:30" },
  { name: "グラス漂白", category: "ホール", area: "ドリンク周辺", minutes: 10, position: "ホール", freq: "weekly", weekdays: [1], slot: "closing", dueTime: "23:00" },
  { name: "電球・照明ほこり取り", category: "その他", area: "その他", minutes: 5, position: "ホール", freq: "monthly", daysOfMonth: [10], slot: "closing", dueTime: "23:00" },
  { name: "レジ周り拭き", category: "ホール", area: "レジ周辺", minutes: 5, position: "ホール", freq: "daily", slot: "before_open", dueTime: "10:45" },
  { name: "レジ下清掃", category: "ホール", area: "レジ下", minutes: 10, position: "ホール", freq: "weekly", weekdays: [3], slot: "closing", dueTime: "23:00" },
  { name: "ショーケース拭き", category: "ホール", area: "ショーケース", minutes: 5, position: "ホール", freq: "daily", slot: "before_open", dueTime: "10:45" },
  { name: "看板拭き", category: "その他", area: "看板", minutes: 5, position: "ホール", freq: "weekly", weekdays: [1], slot: "before_open", dueTime: "10:45" },
  { name: "デザート冷蔵庫内・扉清掃", category: "キッチン", area: "デザート冷蔵庫", minutes: 15, position: "キッチン", freq: "weekly", weekdays: [4], slot: "closing", dueTime: "23:00" },
  { name: "床強化清掃・黒ずみ取り", category: "キッチン", area: "床", minutes: 20, position: "キッチン", photo: "required", priority: "high", freq: "monthly", daysOfMonth: [15], slot: "closing", dueTime: "23:00" },
  { name: "コールドテーブル清掃", category: "キッチン", area: "コールドテーブル", minutes: 15, position: "キッチン", freq: "weekly", weekdays: [5], slot: "closing", dueTime: "23:00" },
  { name: "食品サンプルケース清掃", category: "その他", area: "店頭", minutes: 10, position: "ホール", freq: "weekly", weekdays: [2], slot: "before_open", dueTime: "10:45" },
  { name: "製氷機清掃", category: "キッチン", area: "製氷機", minutes: 15, position: "キッチン", photo: "required", priority: "high", freq: "weekly", weekdays: [3], slot: "closing", dueTime: "23:00" },
  { name: "冷凍庫内清掃", category: "キッチン", area: "冷凍庫", minutes: 20, position: "キッチン", photo: "required", priority: "high", freq: "weekly", weekdays: [4], slot: "closing", dueTime: "23:00" },
  { name: "パスタボイラー清掃", category: "キッチン", area: "パスタボイラー", minutes: 15, position: "キッチン", freq: "daily", slot: "closing", dueTime: "22:30" },
  { name: "フィルター清掃", category: "キッチン", area: "フィルター", minutes: 15, position: "キッチン", photo: "required", priority: "high", freq: "weekly", weekdays: [5], slot: "closing", dueTime: "23:00" },
  { name: "五徳清掃", category: "キッチン", area: "コンロ", minutes: 15, position: "キッチン", photo: "required", priority: "high", freq: "weekly", weekdays: [6], slot: "closing", dueTime: "23:00" },
  { name: "包丁研ぎ・包丁立て清掃", category: "キッチン", area: "包丁", minutes: 15, position: "キッチン", freq: "weekly", weekdays: [0], slot: "closing", dueTime: "23:00" },
  { name: "トースター清掃", category: "キッチン", area: "トースター", minutes: 10, position: "キッチン", freq: "weekly", weekdays: [1], slot: "closing", dueTime: "23:00" },
  { name: "窓ガラス拭き", category: "ホール", area: "窓", minutes: 10, position: "ホール", freq: "weekly", weekdays: [2], slot: "before_open", dueTime: "10:45" },
  { name: "ドリンク冷蔵庫内・扉清掃", category: "ホール", area: "ドリンク周辺", minutes: 15, position: "ホール", freq: "weekly", weekdays: [3], slot: "closing", dueTime: "23:00" },
  { name: "アイス冷凍庫清掃", category: "キッチン", area: "アイス冷凍庫", minutes: 15, position: "キッチン", photo: "required", priority: "high", freq: "weekly", weekdays: [4], slot: "closing", dueTime: "23:00" },
  { name: "みそ汁サーバー清掃", category: "キッチン", area: "みそ汁サーバー", minutes: 10, position: "キッチン", freq: "daily", slot: "closing", dueTime: "22:30" },
  { name: "グリスト強化清掃", category: "キッチン", area: "グリストラップ", minutes: 25, position: "キッチン", photo: "required", priority: "high", freq: "monthly", daysOfMonth: [1], slot: "closing", dueTime: "23:00" },
  { name: "だしポット強化清掃", category: "キッチン", area: "だしポット", minutes: 10, position: "キッチン", freq: "weekly", weekdays: [5], slot: "closing", dueTime: "23:00" },
  { name: "製氷機内清掃", category: "キッチン", area: "製氷機", minutes: 20, position: "キッチン", photo: "required", priority: "high", freq: "monthly", daysOfMonth: [15], slot: "closing", dueTime: "23:00" },
  { name: "床ブリーチ", category: "キッチン", area: "床", minutes: 20, position: "キッチン", photo: "required", priority: "high", freq: "monthly", daysOfMonth: [1], slot: "closing", dueTime: "23:00" },
  { name: "コーヒーマシン清掃", category: "ホール", area: "ドリンク周辺", minutes: 10, position: "ホール", freq: "daily", slot: "closing", dueTime: "22:30" },
  { name: "冷蔵庫レール・扉・取っ手清掃", category: "キッチン", area: "冷蔵庫", minutes: 15, position: "キッチン", freq: "weekly", weekdays: [6], slot: "closing", dueTime: "23:00" },
  { name: "洗浄機周り清掃", category: "キッチン", area: "食洗機", minutes: 10, position: "キッチン", freq: "weekly", weekdays: [0], slot: "closing", dueTime: "23:00" },
  { name: "食器棚・棚後ろ清掃", category: "キッチン", area: "棚", minutes: 15, position: "キッチン", freq: "weekly", weekdays: [1], slot: "closing", dueTime: "23:00" },
  { name: "メニュー拭き", category: "ホール", area: "卓上備品", minutes: 5, position: "ホール", freq: "daily", slot: "before_open", dueTime: "10:45" },
];

// ---------------------------------------------------------------------------
async function loadCategoryIds(): Promise<Map<string, string>> {
  const { data, error } = await admin.from("cleaning_categories").select("id, name");
  if (error) {
    console.error(`✖ カテゴリー取得に失敗: ${error.message}`);
    process.exit(1);
  }
  return new Map((data ?? []).map((r) => [r.name as string, r.id as string]));
}

/** カテゴリー内に無ければ area を新規作成し、id を返す */
async function resolveAreaId(
  categoryId: string,
  categoryName: string,
  areaName: string,
  areaCache: Map<string, string>,
): Promise<string> {
  const key = `${categoryId}/${areaName}`;
  const cached = areaCache.get(key);
  if (cached) return cached;

  const { data: existing } = await admin
    .from("cleaning_areas")
    .select("id")
    .eq("category_id", categoryId)
    .eq("name", areaName)
    .maybeSingle();
  if (existing) {
    areaCache.set(key, existing.id as string);
    return existing.id as string;
  }

  const { data: created, error } = await admin
    .from("cleaning_areas")
    .insert({ category_id: categoryId, name: areaName, sort_order: 999 })
    .select("id")
    .single();
  if (error || !created) {
    console.error(`✖ 清掃場所の作成に失敗（${categoryName}/${areaName}）: ${error?.message}`);
    process.exit(1);
  }
  console.log(`  + 清掃場所を作成: ${categoryName} / ${areaName}`);
  areaCache.set(key, created.id as string);
  return created.id as string;
}

async function main(): Promise<void> {
  const categoryIds = await loadCategoryIds();
  const areaCache = new Map<string, string>();

  let created = 0;
  let updated = 0;
  let schedulesAdded = 0;
  let schedulesSkipped = 0;

  for (const item of ITEMS) {
    const categoryId = categoryIds.get(item.category);
    if (!categoryId) {
      console.error(`✖ カテゴリーが見つかりません: ${item.category}（0001_init.sql は適用済みですか？）`);
      process.exit(1);
    }
    const areaId = await resolveAreaId(categoryId, item.category, item.area, areaCache);

    const masterCols = {
      area_id: areaId,
      category_id: categoryId,
      description: item.description ?? null,
      method: item.method ?? null,
      supplies: item.supplies ?? null,
      estimated_minutes: item.minutes,
      position: item.position,
      photo_requirement: item.photo ?? "optional",
      priority: item.priority ?? "normal",
    };

    const { data: existingMaster } = await admin
      .from("cleaning_master")
      .select("id")
      .eq("name", item.name)
      .maybeSingle();

    let masterId: string;
    if (existingMaster) {
      masterId = existingMaster.id as string;
      const { error } = await admin.from("cleaning_master").update(masterCols).eq("id", masterId);
      if (error) {
        console.error(`✖ 更新に失敗（${item.name}）: ${error.message}`);
        continue;
      }
      updated += 1;
      console.log(`✔ 更新: ${item.name}`);
    } else {
      const { data: inserted, error } = await admin
        .from("cleaning_master")
        .insert({ name: item.name, active: true, ...masterCols })
        .select("id")
        .single();
      if (error || !inserted) {
        console.error(`✖ 作成に失敗（${item.name}）: ${error?.message}`);
        continue;
      }
      masterId = inserted.id as string;
      created += 1;
      console.log(`✔ 新規: ${item.name}`);
    }

    // スケジュールは「1件も無い場合のみ」投入。既存の運用設定（管理画面で編集済み含む）は変更しない。
    const { count } = await admin
      .from("cleaning_schedules")
      .select("id", { count: "exact", head: true })
      .eq("master_id", masterId);
    if ((count ?? 0) > 0) {
      schedulesSkipped += 1;
      continue;
    }

    const scheduleRow: Record<string, unknown> = {
      master_id: masterId,
      frequency: item.freq,
      weekdays: item.weekdays ?? [],
      days_of_month: item.daysOfMonth ?? [],
      time_slot: item.slot,
      due_time: item.dueTime,
      active: true,
    };
    const { error: sErr } = await admin.from("cleaning_schedules").insert(scheduleRow);
    if (sErr) {
      console.error(`✖ スケジュール作成に失敗（${item.name}）: ${sErr.message}`);
      continue;
    }
    schedulesAdded += 1;
  }

  console.log("\n=== 完了 ===");
  console.log(`清掃項目: 新規 ${created} 件 / 更新 ${updated} 件（計 ${ITEMS.length} 件処理）`);
  console.log(`スケジュール: 新規追加 ${schedulesAdded} 件 / 既存のためスキップ ${schedulesSkipped} 件`);
  console.log(
    "\n頻度・曜日・時間帯・担当・写真要否は管理画面（清掃項目マスタ）から後で調整できます。",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
