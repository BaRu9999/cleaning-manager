/**
 * 指定メールアドレスのユーザーを管理者（role=admin / active=true）にする。
 * auth.users トリガーが使えない環境での「最初の管理者」作成や、権限復旧に使う。
 *
 *   npx tsx scripts/set-admin.ts you@example.com
 *   npx tsx scripts/set-admin.ts you@example.com --staff   # 逆に staff へ
 */

import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = createRequire(import.meta.url)(
  "@next/env",
) as typeof import("@next/env");
loadEnvConfig(process.cwd(), true, { info() {}, error: console.error });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const toStaff = process.argv.includes("--staff");

if (!url || !key) {
  console.error("✖ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。");
  process.exit(1);
}
if (!email || email.startsWith("--")) {
  console.error("使い方: npx tsx scripts/set-admin.ts <email> [--staff]");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const user = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`✖ ${email} の Auth ユーザーが見つかりません。先に /login で新規登録してください。`);
    process.exit(1);
  }
  const role = toStaff ? "staff" : "admin";
  const { error: upErr } = await admin.from("users").upsert(
    {
      id: user.id,
      email: user.email,
      display_name:
        (user.user_metadata?.display_name as string | undefined)?.trim() ||
        (user.email ?? "user").split("@")[0],
      role,
      active: !toStaff ? true : undefined,
    },
    { onConflict: "id" },
  );
  if (upErr) throw new Error(upErr.message);
  console.log(`✔ ${email} を ${role}${toStaff ? "" : " / active"} に設定しました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
