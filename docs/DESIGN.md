# 店舗清掃マネージャー — 設計

飲食店1店舗向けの「清掃スケジュール管理・実施記録・通知」Web アプリ。
**単なる TODO ではなく「いつ・どこを・誰が・どの頻度で」を管理し、清掃漏れを減らす**ことを最優先する。

---

## 1. 全体像

```
清掃項目マスタ (cleaning_master)  ── 何を・どこを・どう掃除するか
        │  1:N
清掃スケジュール (cleaning_schedules) ── いつ（頻度・曜日・日付・時間帯・期限）
        │  Cron 00:05 が「当日対象」を判定して生成
        ▼
当日タスク (cleaning_tasks) ── 今日の1件1件。状態を持つ（未実施/実施中/完了/期限超過/スキップ）
        │  スタッフが開始→完了。写真は Supabase Storage
        ▼
実施ログ (cleaning_logs) + 写真 (cleaning_photos) ── 監査証跡・履歴・分析
```

- **1店舗運用**のため店舗テーブルは持たず、`store_settings` / `notification_settings` は
  シングルトン行（`id = 1`）。将来の複数店舗対応は §12。
- 日付は常に **JST（Asia/Tokyo, UTC+9, DSTなし）**。DB には `YYYY-MM-DD` 文字列で保存し
  JST 暦日として扱う（`src/lib/date/jst.ts`）。期限のみ `timestamptz`（`due_at`）で保持。
- 秘密情報は環境変数（`.env.local`）。ソースへ直書きしない。

---

## 2. ユーザーと権限

| 権限 | 説明 | 主な操作 |
|---|---|---|
| `admin`（管理者） | 店長・マネージャー | 清掃項目・頻度・時間帯・担当の登録編集削除、全員の完了状況/未実施/履歴確認、スタッフ管理、Slack設定、カレンダー、漏れ分析 |
| `staff`（スタッフ） | ホール/キッチン等の現場 | 今日の清掃確認、自分の担当確認、完了登録（コメント・写真）、履歴閲覧 |

- ロールは `users.role`。RLS は SECURITY DEFINER 関数 `is_admin()` / `is_active_member()` で判定。
- **サーバー側でも必ず権限チェック**（`requireAdmin()` / `requireMember()` in `src/lib/auth/guard.ts`）。
  RLS はデータ保護の最終防衛線、UI とサーバーガードは体験と早期拒否のため。
- スタッフが自分を `admin` に昇格できないよう、`users` にロール改変防止トリガーを張る。
- `users.has_login`（既定 true）が false の行は「シフト連携のみ」＝ `auth.users` に対応行が無く
  ログイン・LINE通知の対象外。清掃の自動割当・出勤登録の母集団としてのみ使う（§9-C）。
- 例外的に `/reports`（完了レポートPDF、§5-C）のみ `role` ではなく `job_title` も見て許可する
  （`requireReportViewer()`：`role=admin` または `job_title=cleaning_leader` なら許可）。他の
  `/admin/*` 画面は従来どおり `role=admin` 限定のまま。

---

## 3. テーブル（詳細は `supabase/migrations/0001_init.sql`）

| テーブル | 種別 | 用途 |
|---|---|---|
| `users` | プロフィール | `auth.users` の写像。表示名・ロール・担当ポジション・在籍フラグ |
| `cleaning_categories` | マスタ | 清掃カテゴリー（ホール/キッチン/バックヤード/その他）。管理者が追加変更 |
| `cleaning_areas` | マスタ | 清掃場所（テーブル/シンク…）。カテゴリーに属する |
| `cleaning_master` | マスタ | 清掃項目。名称・内容・方法・洗剤備品・所要時間・担当・写真要否・優先度・備考・有効無効 |
| `cleaning_schedules` | マスタ | 清掃項目ごとの繰り返しルール（頻度/曜日/日付/間隔/時間帯/期限時刻）。1項目に複数可 |
| `cleaning_tasks` | 実績 | Cron が日次生成する当日タスク。状態機械を持つ |
| `cleaning_logs` | 実績 | タスクの状態変化（開始/完了/スキップ/差戻し）の追記専用ログ |
| `cleaning_photos` | 実績 | 完了時の写真（Storage パス）。タスク/ログに紐付く |
| `notification_settings` | 設定 | 他システム（棚卸し管理等）と共有の可能性がある旧テーブル。現在は LINE 関連の `line_*` 列のみ清掃が使用 |
| `cleaning_notification_settings` | 設定 | **清掃専用**。Slack Webhook・各通知のオンオフ・最終送信日（二重送信ガード）。他システムと共有しない（§9-D） |
| `store_settings` | 設定 | 店名・営業時間・時間帯定義（営業前/アイドル/閉店作業…）・ポジション一覧 |
| `daily_staffing` | 実績 | 当日の出勤スタッフ（`positions[]` で兼務対応）。清掃自動割当・出勤ゲートの母集団 |
| `equipment_issues` | 実績 | 設備異常報告（重大度・状態・写真・対応記録） |
| `shift_name_aliases` | 設定 | シフトCSVの氏名 → `users.id` の恒久マッピング（`alias` UNIQUE） |
| `shift_import_logs` | 実績 | シフトCSV取込履歴（件数・未解決名） |

### 主なリレーション / index

- `cleaning_areas.category_id → cleaning_categories.id`（`on delete restrict`）
- `cleaning_master.area_id → cleaning_areas.id`（`on delete set null`）、`category_id` は area から
  トリガーで同期（area 未設定でも分類できるよう保持）
- `cleaning_schedules.master_id → cleaning_master.id`（`on delete cascade`）
- `cleaning_tasks.master_id / schedule_id`、`cleaning_logs.task_id / master_id`、
  `cleaning_photos.task_id`
- index: `cleaning_tasks (task_date, status)`, `cleaning_tasks (assignee_id, task_date)`,
  `cleaning_tasks (master_id, task_date)`, 自動生成の重複防止に部分 UNIQUE
  `(master_id, coalesce(schedule_id,'0…'), task_date) where source='auto'`
- `cleaning_logs (master_id, task_date)`, `cleaning_schedules (master_id) where active`

---

## 4. 清掃頻度モデル（`cleaning_schedules`）

| `frequency` | 意味 | 使うカラム | 判定（JST 暦日 d） |
|---|---|---|---|
| `daily` | 毎日 | （`weekdays` 空=毎日 / 指定時はその曜日のみ） | 常に true（`weekdays` 非空なら曜日一致時） |
| `weekday` | 曜日指定 | `weekdays[]` (0=日…6=土) | `weekdays` に `dow(d)` を含む |
| `weekly` | 週1回 | `weekdays[0]` | `dow(d) === weekdays[0]` |
| `biweekly` | 2週に1回 | `weekdays[0]`, `anchor_date` | 曜日一致 かつ `floor(days(anchor,d)/7) % 2 === 0` |
| `monthly` | 月1回 | `days_of_month[0]` | `dom(d) === day`（月末クランプ: day>その月の日数なら末日） |
| `monthly_twice` | 月2回 | `days_of_month[]`（例 `[10,25]`） | `days_of_month` に `dom(d)` を含む（末日クランプ） |
| `day_of_month` | 日付指定 | `days_of_month[]` | 同上 |
| `interval` | 任意間隔 | `interval_days`, `anchor_date` | `d >= anchor` かつ `days(anchor,d) % interval_days === 0` |
| `manual` | 手動登録 | — | 自動生成しない（管理者が個別にタスク追加） |

- 純関数 `shouldRunOn(schedule, date)` → boolean（`src/lib/cleaning/recurrence.ts`、Vitest）。
- カレンダー用に `expandMonth(schedules, yyyyMM)` で月内の発生日を先読みできる。

## 5. 清掃時間帯（`store_settings.time_slots`）

キー固定・ラベルと開始終了は店舗設定で変更可能。

| key | 既定ラベル | 既定時刻 |
|---|---|---|
| `before_open` | 営業前 | 10:00–11:00 |
| `pre_lunch` | ランチ前 | 11:00–11:30 |
| `post_lunch` | ランチ後 | 14:00–15:00 |
| `idle` | アイドル | 15:00–17:00 |
| `pre_dinner` | ディナー前 | 17:00–18:00 |
| `open_hours` | 営業中 | 11:00–22:00 |
| `closing` | 閉店作業 | 22:00 以降 |
| `fixed_time` | 時刻指定 | スケジュールの `fixed_time` を使用 |

- `cleaning_schedules.time_slot` にキーを保存。`due_time`（期限時刻）は任意。
- `cleaning_tasks.due_at` は生成時に `task_date + due_time` を **JST として** `timestamptz` 化。

## 6. タスク状態機械（`cleaning_tasks.status`）

```
              ┌───────────── skip (管理者) ─────────────┐
              ▼                                          │
  pending ──▶ in_progress ──▶ done                       │
     │            │             ▲                        │
     │            │             └── uncomplete(管理者) ──┘
     │            │
     └── due_at 経過（Cron）──▶ overdue ──▶（後から完了可）──▶ done(was_overdue=true)
```

- 生成時 `pending`。「清掃開始」で `in_progress`（`started_at/by`）。
- 「完了する」で `done`（`completed_at/by`, `comment`, `actual_minutes`）。
  **写真必須項目は写真0枚だと完了不可**（サーバー側で拒否）。
- Cron（期限チェック）が `pending`/`in_progress` かつ `due_at < now()` を `overdue` に。
  `was_overdue=true` を立て、以後完了しても記録に残す。
- `skipped` は管理者のみ（`skip_reason` 必須）。
- すべての遷移で `cleaning_logs` に1行追記。

## 7. 画面（ルート）

共通ホーム = **今日の清掃**（`/today`）。ナビはロールで出し分け。

| ルート | 権限 | 内容 |
|---|---|---|
| `/today` | 全員 | 本日の進捗（8/12・67%）、未実施/実施中/完了/期限超過カード、タスク一覧（カード） |
| `/today/[taskId]` | 全員 | タスク詳細・清掃開始・完了フォーム（コメント/写真/所要時間） |
| `/history` | 全員 | 履歴検索（日付/スタッフ/場所/項目/完了未実施/カテゴリー）＋写真 |
| `/admin` | admin | 管理ダッシュボード（完了率・未実施・期限超過・場所別・スタッフ別・曜日別） |
| `/admin/master` | admin | 清掃項目マスタ一覧（有効/無効、頻度、時間帯） |
| `/admin/master/new`・`/admin/master/[id]` | admin | 項目登録・編集（スケジュール複数） |
| `/admin/areas` | admin | カテゴリー・清掃場所の追加変更 |
| `/admin/calendar`・`/admin/calendar/[date]` | admin | 月間清掃カレンダー → 日別履歴 |
| `/admin/analysis` | admin | 清掃漏れ分析（未実施率ランキング） |
| `/admin/staff` | admin | スタッフ管理（招待・ロール・ポジション・在籍） |
| `/admin/settings` | admin | 店舗設定（営業時間・時間帯・ポジション） |
| `/admin/notifications` | admin | Slack通知設定 |
| `/admin/assignments` | admin | 出勤・清掃割当（出勤スタッフ登録＋自動割当ボード） |
| `/admin/shift-import` | admin | タニタ柏シフトCSV取込（出勤・ホール/キッチン担当を自動反映） |
| `/admin/equipment-issues` | admin | 設備異常報告の一覧・対応記録 |
| `/reports` | admin + 清掃リーダー | 週次・月次の完了レポートPDF出力（詳細は README.md §5-C） |
| `/login` | — | ログイン（パスワード / メールリンク） |

## 8. API / Cron

| エンドポイント | 実行 | 役割 |
|---|---|---|
| `POST/GET /api/cron/generate-tasks` | 毎日 00:05 JST | 当日対象スケジュール判定 → `cleaning_tasks` 生成（冪等）→ 続けて `daily_staffing` があれば自動割当 |
| `GET /api/cron/check-overdue` | 30分毎 | 期限超過へ遷移 ＋ 新規超過分を Slack「未実施通知」 |
| `GET /api/cron/slack-daily-plan` | 08:00 JST | 「本日の清掃予定」を Slack へ |
| `GET /api/cron/slack-closing-summary` | 23:00 JST | 「本日の清掃結果」を Slack へ |

- 認証: `Authorization: Bearer ${CRON_SECRET}`。未設定・不一致は 401。**認証なしで実行不可**。
- Cron は Cookie セッションを持たないため **service_role（`createAdminClient`）** で処理。
  RLS を跨ぐのはこの4経路と seed のみ。
- クエリ: `?dry=1`（Slack送信なし）、`?force=1`（二重送信ガード/冪等ガード無視）、
  `?date=YYYY-MM-DD`（対象日上書き）。
- Server Actions（`src/lib/data/*-actions.ts`, `"use server"`）: タスク開始/完了/スキップ/差戻し/
  手動追加、マスタ CRUD、エリア CRUD、スタッフ管理、各種設定。すべて先頭で権限ガード。

## 9. Slack 通知（サーバー側のみ）

`src/lib/slack/messages.ts`（純関数）で本文生成 → `src/lib/slack/notify.ts` で Webhook POST。

- **本日清掃通知**: 時間帯ごとに項目名を列挙。
- **未実施通知**: 期限超過1件ごと（予定時刻・担当）。`check-overdue` が新規超過のみ送る。
- **閉店時通知**: 予定/完了/未実施/完了率＋未実施項目名。
- 二重送信ガード: `cleaning_notification_settings.last_daily_plan_on` / `last_closing_summary_on` に
  対象日を記録。`overdue` は `cleaning_tasks.overdue_notified_at` で1回だけ。
- Slack設定（Webhook URL・有効/無効・通知種別・送信済み日時）は `cleaning_notification_settings`
  （清掃専用、§9-D）。旧 `notification_settings` は読み書きしない。

## 9-B. LINE 通知（役職別・担当者個別）＋ LIFF

詳細は `README.md` §5-B。要点のみ:

- `staff_line_accounts`（`line_user_id` UNIQUE）で LINE ↔ staff を紐付け。登録は LIFF で
  **ID トークンをサーバー検証**（`src/lib/liff/session.ts` / `src/lib/line/verify.ts`）。
  クライアントの userId は信用しない。unfollow は `is_active=false` のみ。
- 純ロジック `src/lib/line/`: `visibility`（役職の閲覧範囲）/ `recipients`（誰に・どの種別。
  **1 `line_user_id` 1通に集約**＝担当者本人かつリーダーでも二重送信しない）/ `messages`（テキスト）/
  `flex`（Flex Message）/ `dispatch`（`notification_logs.dedupe_key` で重複防止 → push）。
- 通知種別 = `morning` / `progress` / `pending` / `overdue` / `closing`。役職 × 種別の ON/OFF は
  `notification_settings.line_role_prefs`（管理画面のマトリクス）。
  - `morning`: staff=自分の担当（Flex）/ leader・manager=全体スケジュール（担当・期限・状態）
  - `progress`: 予定/完了/未実施/完了率 ＋ 未実施一覧。設定時刻（`line_progress_times`）に配信
  - `pending`: 期限前（`line_reminder_offsets`）の未着手を担当者へ / leader へはまとめ
  - `overdue`: `status=overdue` を担当者へ / leader へはまとめ
  - `closing`: 店舗全体レポート
- **出勤ゲート**: `staff` / `cleaning_leader` / `hall_leader` は対象日の `daily_staffing` に
  出勤登録があるスタッフだけへ送る（`isOnDutyForNotification()`、`recipients.ts`）。`manager` は
  常時対象。対象日の `daily_staffing` が0件（未設定）なら制限せず全員へ送る＝フェイルオープン。
- Cron: `line-morning` / `line-progress` / `line-reminder`（30分毎、設定時刻に一致で発火）＋
  `slack-closing-summary` が LINE の `closing` も送る。
- LIFF: `/liff/register`（スタッフ選択 or コード）、`/liff/today`（本人の当日タスクのみ・進捗・
  開始/完了・写真はクライアント縮小 → サーバーが service_role で Storage 保存）。
  1件完了ごとの LINE は送らず、全完了時のみ LIFF 内に完了メッセージ。

## 9-C. シフトCSV連携とシフト連携のみのスタッフ

タニタ柏シフトの「取込用」CSVから `daily_staffing`（出勤・ホール/キッチン担当）を自動反映する
（`/admin/shift-import`、詳細は README.md §5-B「シフト連携」）。

- 純パーサ `src/lib/shift/tanita.ts`。氏名解決は `users.display_name` 完全一致 →
  `shift_name_aliases`（恒久マッピング）→ 未解決は管理者がプレビュー画面で選択、の順。
- タスク生成 Cron（`generate-tasks`）は生成直後に `runAutoAssign()`（`src/lib/cleaning/
  run-auto-assign.ts`）も実行する。当日の `daily_staffing` が既にあれば（シフトCSV取込を
  事前にまとめて行っておけば）その日の清掃は毎晩自動で割り当てられ、`/admin/assignments` の
  手動「自動割当」ボタンは不要になる。出勤スタッフが無い日は割当をスキップするだけで
  タスク生成自体は失敗しない（フェイルオープン）。手動割当ボタン（`runAutoAssignAction`）も
  同じ `runAutoAssign()` を呼ぶため、割当ロジックは1箇所のみ（`assign.ts`）。
- **LINE通知の対象は店長・管理者・ホール/清掃リーダーなど少数**という前提のため、
  シフトCSVの氏名が既存スタッフに一致しない場合は既定で
  **`users.has_login = false` の行として自動登録**する（`role='staff'`, `active=true`）。
  ログインアカウント（`auth.users`）は作らないため、LINE連携・アプリログインの対象にはならない。
  `daily_staffing.user_id` / `cleaning_tasks.assignee_id` はどちらも同じ `users.id` を指すため、
  登録済み・シフト連携のみを区別せず自動割当（`src/lib/cleaning/assign.ts`）に使える。
- `/admin/staff` の「LINE未連携」警告・件数は `has_login=true` の行のみを対象にする
  （シフト連携のみのスタッフを「未連携」として誤警告しないため）。
- 自動割当は `daily_staffing.start_time`/`end_time`（シフトの勤務時間）も候補判定に使う
  （`assign.ts` の `isDuringShift()`）。タスクの期限（`cleaning_tasks.due_at` → `AssignTask.
  dueTime`、JST "HH:MM"）にその時刻勤務していないスタッフは候補から除外し、既存の固定担当も
  勤務時間外になれば再割当対象に戻す。勤務時間が未設定（片方でも null）のスタッフは制約なし
  （フェイルオープン。手動登録でシフト時間を入力していない店舗でも従来どおり動く）。

## 9-D. Slack通知設定の分離（`cleaning_notification_settings`）

このSupabaseプロジェクトは棚卸し管理システム等、他のアプリと共有されることがある。
旧 `notification_settings` テーブルの `slack_webhook_url` 等を共有すると、清掃側で
Webhook URLを保存した瞬間に他システムの設定まで書き換わってしまう（同じ行・同じ列を
複数アプリが読み書きしていたため）。

- `cleaning_notification_settings`（migration `0008`）は清掃専用のシングルトンテーブル。
  `slack_enabled` / `slack_webhook_url` / `notify_daily_plan` / `notify_overdue` /
  `notify_closing_summary` / `last_daily_plan_on` / `last_closing_summary_on` を持つ。
  RLSは旧テーブルと同じ方針（参照・変更とも管理者のみ）。
- `getNotificationSettings()` / `getNotificationSettingsAdmin()`
  （`src/lib/data/settings.ts`）は **2つのテーブルを読んでマージ**する:
  Slack関連は `cleaning_notification_settings`、LINE関連（`line_*`）は旧 `notification_settings`
  から読む。LINE列は清掃専用の列のため、こちらは引き続き旧テーブルに残している
  （移動対象を増やすとかえって影響範囲が広がるため）。`cleaning_notification_settings` の行が
  無い場合は「Slack無効」の安全な既定値を返し、旧テーブルの共有設定へはフォールバックしない。
- 設定保存・テスト送信（`updateNotificationSettingsAction` / `sendTestSlackAction`）と
  Cronの送信済み日時の記録（`slack-daily-plan` / `slack-closing-summary`）は
  すべて `cleaning_notification_settings` のみを読み書きする。LINE設定の保存・テスト送信
  （`updateLineSettingsAction` / `sendTestLineAction`）は変更なし（引き続き旧テーブル）。
- 回帰テスト: `src/lib/data/notification-isolation.test.ts`
  （清掃のSlack設定変更が他システムの行に影響しないこと、LINE設定が引き続き動くことを確認）。

## 10. 分析・ダッシュボード（`src/lib/cleaning/stats.ts` 純関数）

- 完了率（本日/今週/今月）、未実施件数、期限超過件数。
- 清掃場所別完了率、スタッフ別実施数、曜日別未実施件数。
- **未実施率ランキング**: 期間内の項目ごとに `未実施(overdue/pending/skipped) ÷ 予定` を集計し降順。
  「よく忘れられる清掃」を発見する。

## 11. UI 原則（`src/components/ui/*`）

- モバイル最優先。ボタン大きく（本文 `text-base` 以上、主要操作は `h-12` 相当）。
- 1〜2タップで完了登録（`/today` カードから直接「開始」→「完了」）。
- 状態を色で即判別（未実施=スレート / 実施中=青 / 完了=緑 / 期限超過=赤 / スキップ=グレー）。
- 管理画面とスタッフ画面をナビで明確に分離。派手さより「毎日使える業務アプリ」。
- 全画面 loading（Skeleton）/ empty state / API エラー表示を用意。

## 12. 将来拡張（設計上の逃げ道のみ確保、未実装）

- LINE 通知: `notification_settings` に `line_*` 列を足し `src/lib/notify/` を channel 抽象化。
- 複数店舗: 全テーブルに `store_id` を追加し `is_store_member(store_id)` へ RLS を差し替え、
  シングルトン設定を店舗別行に。純関数（recurrence/stats/messages）は無改修で流用可能。
- NFC / QR: `cleaning_master.qr_token` を追加し `/scan/[token]` → 当日タスクへ誘導。
- AI 漏れ分析・スケジュール提案: `stats.ts` の集計結果をコンテキストに Anthropic 呼び出し。
- 衛生点検 / 温度管理 / HACCP / OJT: `cleaning_master.kind`（cleaning/inspection/temp…）で種別分岐、
  タスクに測定値カラム群を追加。
