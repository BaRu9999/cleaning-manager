import type { SupabaseClient } from "@supabase/supabase-js";

/** 未解決の氏名マッピング選択肢: 新規スタッフとして自動登録（ログイン・LINE通知なし） */
export const NEW_STAFF_SENTINEL = "__new_staff__";

export interface StaffOption {
  userId: string;
  displayName: string;
}

export interface NameResolution {
  /** CSV氏名 → userId（完全一致 or 既存エイリアスで解決できたもの） */
  resolved: Map<string, string>;
  /** まだ解決できていない氏名（初回・表記ゆれ等） */
  unmatched: string[];
  /** 手動マッピングUI用の選択肢（在籍スタッフ） */
  staffOptions: StaffOption[];
}

/**
 * CSV上の氏名を users.display_name の完全一致、次に shift_name_aliases で解決する。
 * どちらにも無い名前は unmatched として返し、呼び出し側で管理者に選ばせる。
 */
export async function resolveShiftNames(
  supabase: SupabaseClient,
  names: string[],
): Promise<NameResolution> {
  const uniqueNames = [...new Set(names)];

  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, display_name")
    .eq("active", true);
  if (usersErr) throw new Error(`スタッフ一覧の取得に失敗しました: ${usersErr.message}`);

  const staffOptions: StaffOption[] = ((users ?? []) as { id: string; display_name: string }[]).map(
    (u) => ({ userId: u.id, displayName: u.display_name }),
  );
  const byExactName = new Map(staffOptions.map((u) => [u.displayName, u.userId]));

  const { data: aliases, error: aliasErr } = await supabase
    .from("shift_name_aliases")
    .select("alias, user_id");
  if (aliasErr) throw new Error(`氏名マッピングの取得に失敗しました: ${aliasErr.message}`);
  const byAlias = new Map(
    ((aliases ?? []) as { alias: string; user_id: string }[]).map((a) => [a.alias, a.user_id]),
  );

  const resolved = new Map<string, string>();
  const unmatched: string[] = [];
  for (const name of uniqueNames) {
    const userId = byExactName.get(name) ?? byAlias.get(name);
    if (userId) resolved.set(name, userId);
    else unmatched.push(name);
  }

  return { resolved, unmatched, staffOptions };
}
