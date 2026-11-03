/**
 * タニタ柏シフト「取込用」CSV のパーサ（純関数・DB非依存）。
 *
 * 想定ヘッダー（列順は問わず、名前で解決する）:
 *   date,name,role,start_time,end_time,hourly_rate,planned_headcount,
 *   actual_headcount,transport_cost,wage_cost,planned_labor_cost,
 *   employee_day_key,segment_index
 *
 * 1人が同じ日に複数行（分割シフト・segment_index 1,2,...）を持つことがあるため、
 * 同一 date × name はここでまとめる（出勤時間=最早の開始〜最遅の終了、
 * ポジションは全セグメントの role を合算）。
 *
 * role の表記:
 *   "H"   → ホール
 *   "K"   → キッチン
 *   "H・K" (中点/スラッシュ/カンマ等の区切りを含め H と K を両方含む) → ホール・キッチン兼務
 */

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface TanitaShiftEntry {
  date: string;
  /** CSV上の氏名表記そのまま（例: "鈴木(り)"） */
  name: string;
  /** ["ホール"] / ["キッチン"] / ["ホール","キッチン"] */
  positions: string[];
  /** 当日の最早シフト開始 "HH:MM" */
  startTime: string | null;
  /** 当日の最遅シフト終了 "HH:MM" */
  endTime: string | null;
}

export function mapTanitaRoleToPositions(role: string): string[] {
  const r = (role ?? "").trim().toUpperCase();
  const hasHall = r.includes("H");
  const hasKitchen = r.includes("K");
  const out: string[] = [];
  if (hasHall) out.push("ホール");
  if (hasKitchen) out.push("キッチン");
  return out;
}

function normalizeTime(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return HHMM.test(t) ? t.padStart(5, "0") : null;
}

/** 簡易CSV行分割（値にカンマ/引用符を含まない前提のシンプルな形式） */
function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
}

export interface ParseResult {
  entries: TanitaShiftEntry[];
  /** データ行数（マージ前。エラー行は含まない） */
  rowCount: number;
  /** ヘッダーに date/name/role/start_time/end_time が無い等、致命的な形式エラー */
  error: string | null;
}

export function parseTanitaShiftCsv(csvText: string): ParseResult {
  const lines = csvText.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { entries: [], rowCount: 0, error: "CSVが空です" };
  }
  const header = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const idx = {
    date: header.indexOf("date"),
    name: header.indexOf("name"),
    role: header.indexOf("role"),
    start: header.indexOf("start_time"),
    end: header.indexOf("end_time"),
  };
  if (idx.date < 0 || idx.name < 0 || idx.start < 0 || idx.end < 0) {
    return {
      entries: [],
      rowCount: 0,
      error:
        "CSVのヘッダーに date / name / start_time / end_time 列が見つかりません（タニタ「取込用」形式を確認してください）",
    };
  }

  // date+name でマージ
  const merged = new Map<
    string,
    { date: string; name: string; positions: Set<string>; start: string | null; end: string | null }
  >();

  let rowCount = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]!);
    const date = cols[idx.date]?.trim() ?? "";
    const name = cols[idx.name]?.trim() ?? "";
    if (!DATE.test(date) || !name) continue; // ヘッダー崩れ・空行はスキップ
    rowCount += 1;

    const role = idx.role >= 0 ? (cols[idx.role] ?? "") : "";
    const start = normalizeTime(cols[idx.start]);
    const end = normalizeTime(cols[idx.end]);

    const key = `${date}__${name}`;
    const cur = merged.get(key) ?? { date, name, positions: new Set<string>(), start: null, end: null };
    for (const p of mapTanitaRoleToPositions(role)) cur.positions.add(p);
    if (start && (!cur.start || start < cur.start)) cur.start = start;
    if (end && (!cur.end || end > cur.end)) cur.end = end;
    merged.set(key, cur);
  }

  const entries: TanitaShiftEntry[] = [...merged.values()]
    .map((v) => ({
      date: v.date,
      name: v.name,
      positions: [...v.positions],
      startTime: v.start,
      endTime: v.end,
    }))
    .sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name, "ja") : a.date.localeCompare(b.date)));

  return { entries, rowCount, error: null };
}

/** 取込対象の日付一覧（昇順・重複無し） */
export function distinctDates(entries: TanitaShiftEntry[]): string[] {
  return [...new Set(entries.map((e) => e.date))].sort();
}

/** 氏名（表記ゆれ含めない、そのままの重複無し一覧） */
export function distinctNames(entries: TanitaShiftEntry[]): string[] {
  return [...new Set(entries.map((e) => e.name))].sort((a, b) => a.localeCompare(b, "ja"));
}
