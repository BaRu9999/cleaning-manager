/**
 * Slack Incoming Webhook への投稿。サーバー側からのみ呼ぶこと。
 * 成功時は HTTP 200 かつ本文が "ok"。
 */

export interface SlackMessage {
  /** 通知・フォールバック用のプレーンテキスト（必須） */
  text: string;
  /** Block Kit ブロック配列（任意） */
  blocks?: unknown[];
}

export class SlackNotifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "SlackNotifyError";
  }
}

/** Webhook URL に1件投稿する。失敗時は SlackNotifyError を投げる。 */
export async function postToSlackWebhook(
  webhookUrl: string,
  message: SlackMessage,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<void> {
  if (!/^https:\/\/hooks\.slack\.com\//.test(webhookUrl)) {
    throw new SlackNotifyError(
      "Slack Webhook URL が不正です（https://hooks.slack.com/ で始まる必要があります）",
      0,
      "",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message.text, blocks: message.blocks }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new SlackNotifyError(
      `Slack への送信に失敗しました: ${(e as Error).message}`,
      0,
      "",
    );
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.text().catch(() => "")).trim();
  if (!res.ok || body !== "ok") {
    throw new SlackNotifyError(
      `Slack Webhook 送信失敗 (HTTP ${res.status}): ${body.slice(0, 200) || "(応答なし)"}`,
      res.status,
      body,
    );
  }
}
