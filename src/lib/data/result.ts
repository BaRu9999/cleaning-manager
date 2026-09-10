/** Server Action の共通戻り値。UI 側でエラー表示に使う。 */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

export function ok<T = undefined>(data?: T): ActionResult<T> {
  return { ok: true, data } as ActionResult<T>;
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** 例外 → 表示用メッセージ */
export function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "予期しないエラーが発生しました";
}
