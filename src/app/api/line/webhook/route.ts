/**
 * LINE Messaging API の Webhook。
 *  - follow   … 友だち追加。スタッフ登録（LIFF）へ誘導。既存の連携があれば再有効化
 *  - unfollow … ブロック。staff_line_accounts.is_active=false / blocked_at のみ更新（行は消さない）
 *  - message  … スタッフコード（管理者発行）を送ってきたら紐付け（LIFF が使えない場合の代替）
 *
 * 認証: x-line-signature（HMAC-SHA256, channel secret）。不一致は 401。
 * セッション不要のため middleware から除外している。
 * Channel Access Token / Secret はサーバーのみで扱い、ブラウザへ出さない。
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationSettingsAdmin } from "@/lib/data/settings";
import { getLiffLink, resolveLineConfig } from "@/lib/env";
import { verifyLineSignature } from "@/lib/line/signature";
import { replyLineText } from "@/lib/line/push";
import {
  deactivateLineAccount,
  linkStaffLineAccount,
  reactivateLineAccount,
  resolveStaffByLineUserId,
} from "@/lib/line/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

const REGISTER_URL = () => getLiffLink("/register");

const WELCOME_LIFF =
  "清掃管理システムへようこそ。\nまずはスタッフ登録をお願いします。\n下のボタンから登録してください。";
const WELCOME_CODE =
  "清掃管理システムへようこそ。\n管理者から受け取った『スタッフコード』をこのトークに送信してください。";

/** LIFF があれば登録ボタン、無ければコード送信を案内 */
async function replyRegisterPrompt(
  accessToken: string,
  replyToken: string | undefined,
  { linked }: { linked: boolean } = { linked: false },
): Promise<void> {
  if (!replyToken) return;
  const url = REGISTER_URL();
  const prefix = linked ? "スタッフ登録が必要です。\n" : "";
  if (url) {
    await replyLineText(accessToken, replyToken, prefix + WELCOME_LIFF, {
      label: "スタッフ登録",
      uri: url,
    });
  } else {
    await replyLineText(accessToken, replyToken, prefix + WELCOME_CODE);
  }
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const settings = await getNotificationSettingsAdmin().catch(() => null);
  const line = resolveLineConfig({
    accessToken: settings?.lineChannelAccessToken,
    channelSecret: settings?.lineChannelSecret,
  });

  if (!line || !line.channelSecret) {
    return NextResponse.json({ ok: false, message: "line not configured" }, { status: 503 });
  }
  if (!verifyLineSignature(line.channelSecret, raw, request.headers.get("x-line-signature"))) {
    return NextResponse.json({ ok: false, message: "bad signature" }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw).events ?? []) as LineEvent[];
  } catch {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  for (const ev of events) {
    const userId = ev.source?.userId;
    if (!userId) continue;

    if (ev.type === "unfollow") {
      await deactivateLineAccount(admin, userId);
      continue;
    }

    if (ev.type === "follow") {
      // 過去に連携があれば（ブロック解除含め）再有効化
      const { data: prior } = await admin
        .from("staff_line_accounts")
        .select("staff_id, staff:users!staff_id(display_name)")
        .eq("line_user_id", userId)
        .maybeSingle();
      if (prior) {
        await reactivateLineAccount(admin, userId, null);
        const s = (prior as Record<string, unknown>).staff as { display_name?: string } | { display_name?: string }[] | null;
        const name = (Array.isArray(s) ? s[0] : s)?.display_name ?? "";
        if (ev.replyToken) {
          await replyLineText(
            line.accessToken,
            ev.replyToken,
            `おかえりなさい${name ? `、${name} さん` : ""}。清掃の通知を再開します。`,
          );
        }
      } else {
        await replyRegisterPrompt(line.accessToken, ev.replyToken);
      }
      continue;
    }

    if (ev.type === "message" && ev.message?.type === "text") {
      const alreadyLinked = await resolveStaffByLineUserId(admin, userId);
      if (alreadyLinked) {
        if (ev.replyToken) {
          await replyLineText(
            line.accessToken,
            ev.replyToken,
            `${alreadyLinked.displayName} さんとして連携済みです。`,
          );
        }
        continue;
      }

      const code = (ev.message.text ?? "").trim().toUpperCase().replace(/\s/g, "");
      if (!/^[A-Z0-9]{4,12}$/.test(code)) {
        await replyRegisterPrompt(line.accessToken, ev.replyToken, { linked: true });
        continue;
      }

      const { data: staff } = await admin
        .from("users")
        .select("id, display_name")
        .eq("staff_code", code)
        .eq("active", true)
        .maybeSingle();
      if (!staff) {
        if (ev.replyToken) {
          await replyLineText(
            line.accessToken,
            ev.replyToken,
            "スタッフコードが見つかりませんでした。管理者にご確認ください。",
          );
        }
        continue;
      }

      const res = await linkStaffLineAccount(admin, {
        lineUserId: userId,
        staffId: String((staff as { id: string }).id),
        lineDisplayName: null,
      });
      if (ev.replyToken) {
        await replyLineText(
          line.accessToken,
          ev.replyToken,
          res.ok
            ? `${(staff as { display_name: string }).display_name} さんの LINE 連携が完了しました。`
            : res.error ?? "連携に失敗しました。",
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true });
}
