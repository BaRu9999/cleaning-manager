/**
 * JST（日本標準時 / UTC+9・サマータイムなし）専用の日付ユーティリティ。
 * DB には日付を `YYYY-MM-DD` 文字列で保存し、常に JST の暦日として扱う。
 * 期限などの「時刻を含む瞬間」だけ `timestamptz`（ISO文字列）で保持する。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 与えられた時刻（省略時は現在）の JST 暦日を `YYYY-MM-DD` で返す */
export function jstDateString(at: Date = new Date()): string {
  return new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 現在の JST 時刻 `HH:MM` */
export function jstTimeString(at: Date = new Date()): string {
  return new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16);
}

/** `YYYY-MM-DD` を JST 正午の Date に変換（タイムゾーンずれを避けるため正午基準） */
export function parseJstDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number.parseInt(n, 10));
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12 - 9, 0, 0));
}

/**
 * `YYYY-MM-DD` の暦日 + `HH:MM(:SS)` を JST として解釈し、その瞬間の Date（UTC基準）を返す。
 * 例: ("2026-09-10", "16:00") -> 2026-09-10T07:00:00.000Z
 */
export function jstDateTimeToInstant(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => Number.parseInt(n, 10));
  const [hh, mm, ss] = timeStr.split(":").map((n) => Number.parseInt(n, 10));
  return new Date(
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, (hh ?? 0) - 9, mm ?? 0, ss ?? 0),
  );
}

/** 日付文字列に日数を加算した日付文字列を返す */
export function addDays(dateStr: string, days: number): string {
  return jstDateString(new Date(parseJstDate(dateStr).getTime() + days * DAY_MS));
}

/** a から b までの日数（b - a）。同日は 0。 */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (parseJstDate(b).getTime() - parseJstDate(a).getTime()) / DAY_MS,
  );
}

/** 曜日番号（0=日 ... 6=土）を返す */
export function dayOfWeek(dateStr: string): number {
  return parseJstDate(dateStr).getUTCDay();
}

/** month の何日目か（1-based） */
export function dayOfMonth(dateStr: string): number {
  return Number.parseInt(dateStr.slice(8, 10), 10);
}

/** その月の初日 `YYYY-MM-01` */
export function startOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

/** その月の末日 `YYYY-MM-DD` */
export function endOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map((n) => Number.parseInt(n, 10));
  const last = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  return `${dateStr.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** その月の日数 */
export function daysInMonth(dateStr: string): number {
  return Number.parseInt(endOfMonth(dateStr).slice(8, 10), 10);
}

/** from..to（両端含む）の日付文字列配列 */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 3660) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** 表示用: `YYYY-MM-DD` -> `M/D(曜)` */
export function formatShortJp(dateStr: string): string {
  const m = Number.parseInt(dateStr.slice(5, 7), 10);
  const d = Number.parseInt(dateStr.slice(8, 10), 10);
  return `${m}/${d}(${WD[dayOfWeek(dateStr)]})`;
}

/** 表示用: `YYYY-MM-DD` -> `YYYY年M月D日(曜)` */
export function formatLongJp(dateStr: string): string {
  const y = dateStr.slice(0, 4);
  const m = Number.parseInt(dateStr.slice(5, 7), 10);
  const d = Number.parseInt(dateStr.slice(8, 10), 10);
  return `${y}年${m}月${d}日(${WD[dayOfWeek(dateStr)]})`;
}

/** 表示用: `YYYY-MM` -> `YYYY年M月` */
export function formatMonthJp(ym: string): string {
  const y = ym.slice(0, 4);
  const m = Number.parseInt(ym.slice(5, 7), 10);
  return `${y}年${m}月`;
}

/** ISO 文字列（timestamptz）-> JST の `M/D HH:MM`。失敗時は null */
export function formatInstantJst(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const j = new Date(t + JST_OFFSET_MS);
  const mo = j.getUTCMonth() + 1;
  const da = j.getUTCDate();
  const hh = String(j.getUTCHours()).padStart(2, "0");
  const mi = String(j.getUTCMinutes()).padStart(2, "0");
  return `${mo}/${da} ${hh}:${mi}`;
}

/** ISO 文字列 -> JST の `HH:MM`。失敗時は null */
export function formatTimeJst(iso: string | null | undefined): string | null {
  const s = formatInstantJst(iso);
  return s ? (s.split(" ")[1] ?? null) : null;
}

/** `HH:MM:SS` / `HH:MM` -> `HH:MM` */
export function trimSeconds(time: string | null | undefined): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}
