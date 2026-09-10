/**
 * アプリ全体の既定値・表示ラベル・チューニング値。
 * 店舗ごとに上書きできる値（営業時間・時間帯・ポジション）は `store_settings` に保存し、
 * ここはあくまで初期値・フォールバック・enum ラベルとして扱う。
 */

export const APP_NAME = "店舗清掃マネージャー";
export const APP_DESCRIPTION =
  "飲食店の定期清掃を「いつ・どこを・誰が・どの頻度で」で管理し、清掃漏れを減らす業務アプリ。";

/** タイムゾーン（MVPでは Asia/Tokyo 固定 / 日本標準時 UTC+9・DSTなし） */
export const APP_TIMEZONE = "Asia/Tokyo";

/** 清掃写真の Storage バケット名 */
export const PHOTO_BUCKET = "cleaning-photos";
/** 1タスクあたりの写真上限 */
export const MAX_PHOTOS_PER_TASK = 4;
/** 写真の最大バイト数（クライアント側の事前チェック用。Storage 側でも 10MiB 制限） */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 頻度
// ---------------------------------------------------------------------------
export const FREQUENCIES = [
  "daily",
  "weekday",
  "weekly",
  "biweekly",
  "monthly",
  "monthly_twice",
  "day_of_month",
  "interval",
  "manual",
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "毎日",
  weekday: "曜日指定",
  weekly: "週1回",
  biweekly: "2週間に1回",
  monthly: "月1回",
  monthly_twice: "月2回",
  day_of_month: "日付指定",
  interval: "任意間隔",
  manual: "手動登録",
};

// ---------------------------------------------------------------------------
// 時間帯（キーは固定。ラベル・時刻は store_settings.time_slots で変更可）
// ---------------------------------------------------------------------------
export const TIME_SLOTS = [
  "before_open",
  "pre_lunch",
  "post_lunch",
  "idle",
  "pre_dinner",
  "open_hours",
  "closing",
  "fixed_time",
] as const;
export type TimeSlotKey = (typeof TIME_SLOTS)[number];

export const TIME_SLOT_LABELS: Record<TimeSlotKey, string> = {
  before_open: "営業前",
  pre_lunch: "ランチ前",
  post_lunch: "ランチ後",
  idle: "アイドル",
  pre_dinner: "ディナー前",
  open_hours: "営業中",
  closing: "閉店作業",
  fixed_time: "時刻指定",
};

/** 通知・一覧での時間帯の並び順 */
export const TIME_SLOT_ORDER: TimeSlotKey[] = [...TIME_SLOTS];

export interface TimeSlotConfig {
  key: TimeSlotKey;
  label: string;
  start: string | null;
  end: string | null;
}

export const DEFAULT_TIME_SLOTS: TimeSlotConfig[] = [
  { key: "before_open", label: "営業前", start: "10:00", end: "11:00" },
  { key: "pre_lunch", label: "ランチ前", start: "11:00", end: "11:30" },
  { key: "post_lunch", label: "ランチ後", start: "14:00", end: "15:00" },
  { key: "idle", label: "アイドル", start: "15:00", end: "17:00" },
  { key: "pre_dinner", label: "ディナー前", start: "17:00", end: "18:00" },
  { key: "open_hours", label: "営業中", start: "11:00", end: "22:00" },
  { key: "closing", label: "閉店作業", start: "22:00", end: "23:00" },
  { key: "fixed_time", label: "時刻指定", start: null, end: null },
];

export const DEFAULT_POSITIONS = ["ホール", "キッチン", "バックヤード", "マネージャー"];

// ---------------------------------------------------------------------------
// 写真要否 / 優先度 / 状態 / ロール
// ---------------------------------------------------------------------------
export const PHOTO_REQUIREMENTS = ["required", "optional", "none"] as const;
export type PhotoRequirement = (typeof PHOTO_REQUIREMENTS)[number];
export const PHOTO_REQUIREMENT_LABELS: Record<PhotoRequirement, string> = {
  required: "写真必須",
  optional: "写真任意",
  none: "写真不要",
};

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "低",
  normal: "通常",
  high: "高",
};

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "done",
  "overdue",
  "skipped",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "未実施",
  in_progress: "実施中",
  done: "完了",
  overdue: "期限超過",
  skipped: "スキップ",
};

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  admin: "管理者",
  staff: "スタッフ",
};

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 曜日別未実施の集計などで使う「営業日」。既定は全曜日。 */
export const DEFAULT_BUSINESS_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
