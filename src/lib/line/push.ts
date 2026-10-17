/**
 * LINE Messaging API へのプッシュ送信。サーバー側からのみ呼ぶ。
 * 1ユーザーずつ内容が異なるため push を使う。テキスト / Flex の両方に対応。
 * Channel Access Token は絶対にブラウザへ渡さない。
 */

const PUSH_URL = "https://api.line.me/v2/bot/message/push";
const REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const TEXT_LIMIT = 4900;

export class LinePushError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "LinePushError";
  }
}

export type LineMessage =
  | { type: "text"; text: string }
  | { type: "flex"; altText: string; contents: unknown };

export function textMessage(text: string): { type: "text"; text: string }[] {
  const t = text.trim();
  if (t.length <= TEXT_LIMIT) return [{ type: "text", text: t }];
  const chunks: string[] = [];
  let rest = t;
  while (rest.length > 0 && chunks.length < 5) {
    chunks.push(rest.slice(0, TEXT_LIMIT));
    rest = rest.slice(TEXT_LIMIT);
  }
  return chunks.map((c) => ({ type: "text", text: c }));
}

/** 任意のメッセージ配列を1ユーザーへプッシュ。request-id を返す。 */
export async function pushLineMessages(
  accessToken: string,
  toUserId: string,
  messages: LineMessage[],
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<{ requestId: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to: toUserId, messages: messages.slice(0, 5) }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new LinePushError(`LINE 送信に失敗しました: ${(e as Error).message}`, 0, "");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LinePushError(
      `LINE push 失敗 (HTTP ${res.status}): ${body.slice(0, 300)}`,
      res.status,
      body,
    );
  }
  return { requestId: res.headers.get("x-line-request-id") };
}

export async function pushLineText(
  accessToken: string,
  toUserId: string,
  text: string,
): Promise<{ requestId: string | null }> {
  return pushLineMessages(accessToken, toUserId, textMessage(text));
}

/** Webhook の replyToken へテキスト返信（失敗は握りつぶす） */
export async function replyLineText(
  accessToken: string,
  replyToken: string,
  text: string,
  quickReplyUrl?: { label: string; uri: string },
): Promise<void> {
  const message: Record<string, unknown> = { type: "text", text };
  if (quickReplyUrl) {
    message.quickReply = {
      items: [
        {
          type: "action",
          action: { type: "uri", label: quickReplyUrl.label, uri: quickReplyUrl.uri },
        },
      ],
    };
  }
  await fetch(REPLY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [message] }),
  }).catch(() => undefined);
}
