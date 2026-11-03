/**
 * 認証・権限ガード。
 *
 * - RLS はデータ保護の最終防衛線。ここは体験（早期リダイレクト）とサーバー側の
 *   二重チェックのため。Server Component と Server Action の両方から使う。
 * - `getProfile()` は `users` 行が無ければ最小限の行（staff / 非アクティブ）を
 *   idempotent に作る（auth トリガー未設置環境のフォールバック）。
 */

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AUTH_USER_EMAIL_HEADER, AUTH_USER_ID_HEADER } from "@/lib/supabase/auth-headers";
import { mapUserProfile } from "@/lib/data/mappers";
import type { UserProfile } from "@/lib/types/domain";

export class ForbiddenError extends Error {
  constructor(message = "権限がありません") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * middleware が検証済み（`supabase.auth.getUser()` 済み）の場合はヘッダーから読み、
 * Supabase Auth サーバーへの往復を省略する。ヘッダーが無ければ（matcher対象外等）
 * 通常どおり `supabase.auth.getUser()` で検証する＝安全性は落とさないフォールバック。
 */
export const getSessionUser = cache(
  async (): Promise<{ id: string; email: string | null } | null> => {
    const h = await headers();
    const headerId = h.get(AUTH_USER_ID_HEADER);
    if (headerId) {
      return { id: headerId, email: h.get(AUTH_USER_EMAIL_HEADER) || null };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email ?? null } : null;
  },
);

export const getProfile = cache(async (): Promise<UserProfile | null> => {
  const session = await getSessionUser();
  if (!session) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.id)
    .maybeSingle();
  if (error) {
    throw new Error(`プロフィールの取得に失敗しました: ${error.message}`);
  }
  if (data) return mapUserProfile(data as Record<string, unknown>);

  // フォールバック: 行が無ければ作成（staff / 非アクティブ = 管理者の承認待ち）。
  // auth.users トリガーが未設置の環境、または新規サインアップ直後のみの稀なパスなので
  // ここだけ user_metadata（display_name）取得のため getUser() を呼ぶ。
  // 競合しても安全なよう upsert + 再取得。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    (typeof meta?.display_name === "string" && meta.display_name.trim()) ||
    (session.email ? session.email.split("@")[0] : "") ||
    "スタッフ";
  await supabase
    .from("users")
    .upsert(
      { id: session.id, email: session.email, display_name: displayName },
      { onConflict: "id", ignoreDuplicates: true },
    );
  const { data: after } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.id)
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

/** 管理者、または役職が清掃リーダーのスタッフを要求（週次/月次レポート閲覧用）。それ以外は /today へ戻す */
export async function requireReportViewer(): Promise<UserProfile> {
  const profile = await requireMember();
  if (profile.role !== "admin" && profile.jobTitle !== "cleaning_leader") redirect("/today");
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
