/**
 * 認証・権限ガード。
 *
 * - RLS はデータ保護の最終防衛線。ここは体験（早期リダイレクト）とサーバー側の
 *   二重チェックのため。Server Component と Server Action の両方から使う。
 * - `getProfile()` は `users` 行が無ければ最小限の行（staff / 非アクティブ）を
 *   idempotent に作る（auth トリガー未設置環境のフォールバック）。
 */

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapUserProfile } from "@/lib/data/mappers";
import type { UserProfile } from "@/lib/types/domain";

export class ForbiddenError extends Error {
  constructor(message = "権限がありません") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const getSessionUser = cache(
  async (): Promise<{ id: string; email: string | null } | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email ?? null } : null;
  },
);

export const getProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    throw new Error(`プロフィールの取得に失敗しました: ${error.message}`);
  }
  if (data) return mapUserProfile(data as Record<string, unknown>);

  // フォールバック: 行が無ければ作成（staff / 非アクティブ = 管理者の承認待ち）
  // auth.users トリガーが未設置の環境向け。競合しても安全なよう upsert + 再取得。
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    (typeof meta?.display_name === "string" && meta.display_name.trim()) ||
    (user.email ? user.email.split("@")[0] : "") ||
    "スタッフ";
  await supabase
    .from("users")
    .upsert(
      { id: user.id, email: user.email ?? null, display_name: displayName },
      { onConflict: "id", ignoreDuplicates: true },
    );
  const { data: after } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return after ? mapUserProfile(after as Record<string, unknown>) : null;
});

/** ログイン済み & 在籍中を要求。未ログイン→/login、未承認→/pending */
export async function requireMember(): Promise<UserProfile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/pending");
  return profile;
}

/** 管理者を要求。スタッフは /today へ戻す */
export async function requireAdmin(): Promise<UserProfile> {
  const profile = await requireMember();
  if (profile.role !== "admin") redirect("/today");
  return profile;
}

// --- Server Action 用（redirect ではなく throw） ---------------------------

export async function assertMember(): Promise<UserProfile> {
  const profile = await getProfile();
  if (!profile) throw new ForbiddenError("ログインが必要です");
  if (!profile.active) throw new ForbiddenError("利用が承認されていません");
  return profile;
}

export async function assertAdmin(): Promise<UserProfile> {
  const profile = await assertMember();
  if (profile.role !== "admin") throw new ForbiddenError("管理者権限が必要です");
  return profile;
}
