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

/** 実施不可理由コード */
export const SKIP_REASON_CODES = [
  "busy",
  "equipment_in_use",
  "supply_shortage",
  "equipment_issue",
  "staff_shortage",
  "safety",
  "other",
] as const;
export type SkipReasonCode = (typeof SKIP_REASON_CODES)[number];
export const SKIP_REASON_CODE_LABELS: Record<SkipReasonCode, string> = {
  busy: "営業多忙",
  equipment_in_use: "機器使用中",
  supply_shortage: "洗剤・備品不足",
  equipment_issue: "設備不具合",
  staff_shortage: "人員不足",
  safety: "安全上実施不可",
  other: "その他",
};

/** 設備異常の重要度 */
export const EQUIPMENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type EquipmentSeverity = (typeof EQUIPMENT_SEVERITIES)[number];
export const EQUIPMENT_SEVERITY_LABELS: Record<EquipmentSeverity, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "重大",
};

/** 設備異常の対応状況 */
export const EQUIPMENT_STATUSES = ["open", "in_progress", "resolved"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];
export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  resolved: "解決済み",
};

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

/**
 * 役職（job_title）。権限（role: admin/staff）とは独立で、
 * 「LINE 通知の内容」と「清掃の閲覧範囲」を決める。
 */
export const JOB_TITLES = [
  "staff",
  "cleaning_leader",
  "hall_leader",
  "manager",
] as const;
export type JobTitle = (typeof JOB_TITLES)[number];
export const JOB_TITLE_LABELS: Record<JobTitle, string> = {
  staff: "一般スタッフ",
  cleaning_leader: "清掃リーダー",
  hall_leader: "ホールリーダー",
  manager: "店長",
};

/** カテゴリーの区分（ホールリーダーの既定フィルタ等に使用） */
export const CATEGORY_SIDES = ["hall", "kitchen", "backyard", "other"] as const;
export type CategorySide = (typeof CATEGORY_SIDES)[number];
export const CATEGORY_SIDE_LABELS: Record<CategorySide, string> = {
  hall: "ホール",
  kitchen: "キッチン",
  backyard: "バックヤード",
  other: "その他",
};

/**
 * LINE 通知種別（役職ごとに ON/OFF）。内容は役職で出し分ける。
 *  morning  … 朝の清掃予定通知
 *             staff        → 自分の担当だけ（Flex）
 *             leader/店長  → 全清掃スケジュール（誰が・何時までに・どこを・状態）
 *  progress … 途中進捗通知（設定時刻に「予定/完了/未実施/完了率 ＋ 未実施リスト」）
 *  pending  … 未実施通知（期限が近いのに未着手 → 担当者本人＋受信役職へ）
 *  overdue  … 期限超過通知（status=overdue → 担当者本人＋受信役職へ）
 *  closing  … 閉店後レポート（店舗全体）
 */
export const LINE_NOTIFY_TYPES = [
  "morning",
  "progress",
  "pending",
  "overdue",
  "closing",
] as const;
export type LineNotifyType = (typeof LINE_NOTIFY_TYPES)[number];
export const LINE_NOTIFY_TYPE_LABELS: Record<LineNotifyType, string> = {
  morning: "朝の清掃予定通知",
  progress: "途中進捗通知",
  pending: "未実施通知",
  overdue: "期限超過通知",
  closing: "閉店後レポート",
};

export type LineRolePrefs = Record<JobTitle, Record<LineNotifyType, boolean>>;

export const DEFAULT_LINE_ROLE_PREFS: LineRolePrefs = {
  // staff … 本人の担当のみ。進捗・閉店後は不要
  staff: { morning: true, progress: false, pending: true, overdue: true, closing: false },
  // cleaning_leader … 原則すべて（未実施・期限超過も通知）
  cleaning_leader: { morning: true, progress: true, pending: true, overdue: true, closing: true },
  // hall_leader … ホール系のスケジュール。進捗・閉店後は既定オフ（管理画面で変更可）
  hall_leader: { morning: true, progress: false, pending: true, overdue: true, closing: false },
  // manager … 全清掃 ＋ 管理情報（未実施・期限超過・担当未設定）
  manager: { morning: true, progress: true, pending: true, overdue: true, closing: true },
};

export const DEFAULT_LINE_MORNING_TIME = "09:30";
export const DEFAULT_LINE_PROGRESS_TIMES = ["17:00"];
export const DEFAULT_LINE_CLOSING_TIME = "23:00";
/** 未実施通知（期限前リマインド）の分オフセット。負=前 / 0=時刻 / 正=後 */
export const DEFAULT_LINE_REMINDER_OFFSETS = [-30];

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 曜日別未実施の集計などで使う「営業日」。既定は全曜日。 */
export const DEFAULT_BUSINESS_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
