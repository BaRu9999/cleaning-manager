/**
 * LINE Webhook の署名検証。
 * x-line-signature = Base64( HMAC-SHA256(channelSecret, rawBody) )
 */

import crypto from "node:crypto";

export function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}
