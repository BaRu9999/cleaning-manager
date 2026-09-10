/**
 * デモ用の初期データ投入。
 *
 *   npm run seed
 *
 * 行う処理:
 *   1. SEED_ADMIN_EMAIL の Auth ユーザーを探し、public.users を role=admin / active=true に
 *   2. 初期カテゴリー・清掃場所（0001_init.sql で投入済み）を名前で解決
 *   3. 動作確認用の清掃項目マスタを 20 件 + スケジュールを投入（既存なら name でスキップ）
 *
 * 生成された「当日タスク」は Cron（毎日 0:05）か、管理ダッシュボードの
 * 「本日分を生成」ボタン、または次で作れます:
 *   curl -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/generate-tasks"
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
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;

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
type Freq =
  | "daily"
  | "weekday"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "monthly_twice"
  | "day_of_month"
  | "interval"
  | "manual";
type Slot =
  | "before_open"
  | "pre_lunch"
  | "post_lunch"
  | "idle"
  | "pre_dinner"
  | "open_hours"
  | "closing"
  | "fixed_time";

interface SeedItem {
  name: string;
  category: string;
  area: string;
  description?: string;
  method?: string;
  supplies?: string;
  minutes?: number;
  position?: string;
  photo?: "required" | "optional" | "none";
  priority?: "low" | "normal" | "high";
  freq: Freq;
  weekdays?: number[];
  daysOfMonth?: number[];
  slot: Slot;
  dueTime?: string;
}

const ITEMS: SeedItem[] = [
  // --- 毎日 ---
  { name: "テーブル・イスの清掃", category: "ホール", area: "テーブル", freq: "daily", slot: "before_open", minutes: 15, position: "ホール", supplies: "アルコール, クロス", dueTime: "11:00" },
  { name: "卓上備品の補充・拭き上げ", category: "ホール", area: "卓上備品", freq: "daily", slot: "before_open", minutes: 10, position: "ホール", dueTime: "11:00" },
  { name: "入口ガラスの清掃", category: "その他", area: "店頭", freq: "daily", slot: "before_open", minutes: 5, position: "ホール", supplies: "ガラスクリーナー", dueTime: "11:00" },
  { name: "レジ周辺の清掃", category: "ホール", area: "レジ周辺", freq: "daily", slot: "before_open", minutes: 5, position: "ホール", dueTime: "11:00" },
  { name: "冷蔵庫取手の除菌", category: "キッチン", area: "冷蔵庫", freq: "daily", slot: "idle", minutes: 3, position: "キッチン", supplies: "アルコール", dueTime: "15:00" },
  { name: "電子レンジ庫内の清掃", category: "キッチン", area: "電子レンジ", freq: "daily", slot: "idle", minutes: 5, position: "キッチン", dueTime: "17:00" },
  { name: "シンクの清掃", category: "キッチン", area: "シンク", freq: "daily", slot: "closing", minutes: 8, position: "キッチン", dueTime: "22:30" },
  { name: "排水口の清掃", category: "キッチン", area: "排水口", freq: "daily", slot: "closing", minutes: 10, position: "キッチン", photo: "required", priority: "high", supplies: "パイプ洗剤, ブラシ", dueTime: "22:30" },
  { name: "ホール床のモップがけ", category: "ホール", area: "床", freq: "daily", slot: "closing", minutes: 15, position: "ホール", dueTime: "22:30" },
  // --- 週次 ---
  { name: "冷凍庫内部の清掃", category: "キッチン", area: "冷凍庫", freq: "weekly", weekdays: [2], slot: "idle", minutes: 25, position: "キッチン", photo: "required", priority: "high", dueTime: "17:00" },
  { name: "棚上部のホコリ取り", category: "キッチン", area: "棚", freq: "weekly", weekdays: [4], slot: "idle", minutes: 15, position: "キッチン", dueTime: "17:00" },
  { name: "冷蔵庫内部の清掃", category: "キッチン", area: "冷蔵庫", freq: "monthly_twice", daysOfMonth: [10, 25], slot: "idle", minutes: 30, position: "キッチン", photo: "required", priority: "high", dueTime: "17:00" },
  { name: "キッチン壁の清掃", category: "キッチン", area: "壁", freq: "weekly", weekdays: [1], slot: "closing", minutes: 20, position: "キッチン", dueTime: "23:00" },
  { name: "ストック棚の整理・清掃", category: "バックヤード", area: "ストック棚", freq: "weekly", weekdays: [3], slot: "before_open", minutes: 20, position: "バックヤード", dueTime: "11:00" },
  { name: "フライヤーの清掃", category: "キッチン", area: "フライヤー", freq: "weekly", weekdays: [5], slot: "closing", minutes: 30, position: "キッチン", photo: "required", priority: "high", dueTime: "23:00" },
  // --- 月次 ---
  { name: "換気扇の清掃", category: "キッチン", area: "コンロ", freq: "monthly", daysOfMonth: [1], slot: "closing", minutes: 45, position: "キッチン", photo: "required", priority: "high", supplies: "油汚れ用洗剤", dueTime: "23:30" },
  { name: "冷蔵庫フィルターの清掃", category: "キッチン", area: "冷蔵庫", freq: "monthly", daysOfMonth: [15], slot: "idle", minutes: 20, position: "キッチン", dueTime: "17:00" },
  { name: "冷凍庫フィルターの清掃", category: "キッチン", area: "冷凍庫", freq: "monthly", daysOfMonth: [15], slot: "idle", minutes: 20, position: "キッチン", dueTime: "17:00" },
  { name: "大型什器裏の清掃", category: "キッチン", area: "床", freq: "monthly", daysOfMonth: [20], slot: "closing", minutes: 40, position: "キッチン", priority: "high", dueTime: "23:30" },
  { name: "ホール壁上部・照明の清掃", category: "ホール", area: "壁", freq: "monthly", daysOfMonth: [5], slot: "before_open", minutes: 30, position: "ホール", dueTime: "11:00" },
];

// ---------------------------------------------------------------------------
async function promoteAdmin(): Promise<void> {
  if (!ADMIN_EMAIL) {
    console.warn("… SEED_ADMIN_EMAIL 未設定のため管理者昇格はスキップします");
    return;
  }
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error(`✖ Auth ユーザー一覧の取得に失敗: ${error.message}`);
    return;
  }
  const user = data.users.find(
    (u) => (u.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
  if (!user) {
    console.warn(
      `… ${ADMIN_EMAIL} の Auth ユーザーが見つかりません。先に /login の「新規登録」で作成してください。`,
    );
    return;
  }
  const displayName =
    (user.user_metadata?.display_name as string | undefined)?.trim() ||
    ADMIN_EMAIL.split("@")[0];
  const { error: upErr } = await admin.from("users").upsert(
    {
      id: user.id,
      email: user.email,
      display_name: displayName,
      role: "admin",
      active: true,
    },
    { onConflict: "id" },
  );
  if (upErr) console.error(`✖ 管理者昇格に失敗: ${upErr.message}`);
  else console.log(`✔ ${ADMIN_EMAIL} を管理者（active）に設定しました`);
}

async function resolveAreaMap(): Promise<Map<string, string>> {
  const { data: cats } = await admin.from("cleaning_categories").select("id, name");
  const catByName = new Map((cats ?? []).map((c) => [c.name as string, c.id as string]));
  const { data: areas } = await admin
    .from("cleaning_areas")
    .select("id, name, category_id");
  const map = new Map<string, string>();
  for (const a of areas ?? []) {
    for (const [cname, cid] of catByName) {
      if (cid === a.category_id) map.set(`${cname}/${a.name}`, a.id as string);
    }
  }
  return map;
}

async function seedMasters(): Promise<void> {
  const areaMap = await resolveAreaMap();
  const { data: existing } = await admin.from("cleaning_master").select("name");
  const existingNames = new Set((existing ?? []).map((r) => r.name as string));

  let created = 0;
  for (const item of ITEMS) {
    if (existingNames.has(item.name)) {
      console.log(`- スキップ（既存）: ${item.name}`);
      continue;
    }
    const areaId = areaMap.get(`${item.category}/${item.area}`) ?? null;
    const { data: master, error } = await admin
      .from("cleaning_master")
      .insert({
        name: item.name,
        area_id: areaId,
        description: item.description ?? null,
        method: item.method ?? null,
        supplies: item.supplies ?? null,
        estimated_minutes: item.minutes ?? null,
        position: item.position ?? null,
        photo_requirement: item.photo ?? "optional",
        priority: item.priority ?? "normal",
        active: true,
      })
      .select("id")
      .single();
    if (error || !master) {
      console.error(`✖ ${item.name}: ${error?.message}`);
      continue;
    }
    const { error: sErr } = await admin.from("cleaning_schedules").insert({
      master_id: master.id,
      frequency: item.freq,
      weekdays: item.weekdays ?? [],
      days_of_month: item.daysOfMonth ?? [],
      time_slot: item.slot,
      due_time: item.dueTime ?? null,
      active: true,
    });
    if (sErr) console.error(`✖ ${item.name} スケジュール: ${sErr.message}`);
    else {
      created += 1;
      console.log(`✔ ${item.name}`);
    }
  }
  console.log(`\n完了: ${created} 件の清掃項目を作成しました。`);
}

async function main(): Promise<void> {
  await promoteAdmin();
  await seedMasters();
  console.log(
    "\n次のいずれかで当日タスクを生成できます:\n" +
      "  ・管理ダッシュボードの「本日分を生成」\n" +
      '  ・curl -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/cron/generate-tasks"',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
