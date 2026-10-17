# 店舗清掃マネージャー

飲食店1店舗向けの **清掃スケジュール管理・実施記録・通知** Web アプリ。

> 単なる清掃 TODO ではなく、
> **「定期清掃を忘れない」「誰が実施したか残る」「店長がいちいち確認しなくても運用できる」**
> を目的にしています。スタッフは営業中でも数秒で操作でき、管理者は清掃漏れだけ確認すれば
> よい状態を目指します。

---

## 1. システム概要

| やること | 内容 |
|---|---|
| 清掃マスタ管理 | 「清掃名・場所・カテゴリー・内容・方法・洗剤/備品・所要時間・頻度・曜日/日付・時間帯・期限時刻・担当ポジション/スタッフ・写真要否・優先度・備考・有効/無効」を管理者が登録 |
| 予定の自動生成 | 毎日 0:05（JST）に Vercel Cron が当日対象の清掃を判定し `cleaning_tasks` を生成（冪等） |
| 今日の清掃 | スタッフのホーム画面。本日の進捗（8/12・67%）、未実施/実施中/完了/期限超過、時間帯ごとのカード一覧 |
| 完了登録 | 1〜2タップで「開始」→「完了」。コメント・所要時間・写真（スマホカメラ）。**写真必須の清掃は写真なしでは完了不可** |
| 期限超過 | 期限時刻を過ぎて未完了なら自動で「期限超過」。Slack へ未実施通知 |
| Slack 通知 | 当日清掃予定（朝）・未実施（随時）・本日の清掃結果（夜）をサーバー側から自動投稿 |
| 履歴・カレンダー | 日付/スタッフ/場所/項目/状態/カテゴリーで検索。月間カレンダーから日別履歴へ |
| ダッシュボード | 今日/今週/今月の完了率、未実施・期限超過件数、場所別完了率、スタッフ別実施数、曜日別未実施 |
| 清掃漏れ分析 | 「よく忘れられている清掃」の未実施率ランキング |

権限は **管理者 / スタッフ** の2種類。スタッフは管理設定を変更できません。

---

## 2. 使用技術

- **Next.js 15.5**（App Router） / **React 19** / **TypeScript 5.9**（strict）
- **Tailwind CSS v4**（`@import "tailwindcss"` + `@theme` / PostCSS）
- **Supabase**: 認証（`@supabase/ssr`, Cookie セッション）＋ Postgres ＋ **RLS** ＋ Storage（写真）
- **Zod v4**（入力・設定スキーマ）
- **Vitest**（`src/**/*.test.ts`, node 環境） … 頻度エンジン・生成・集計・Slack/LINE 文面・
  役職別の宛先ロジックなど純関数を検証（37 ケース）
- 通知: **Slack Incoming Webhook** ＋ **LINE Messaging API（Push / Flex）** ＋ **LIFF**（スタッフ登録・
  今日の清掃）。送信・トークン検証はすべてサーバー側
- デプロイ: **Vercel** ＋ **Vercel Cron**（GitHub リポジトリ）
- 日時はすべて **JST（Asia/Tokyo, UTC+9・DSTなし）**。日付は `YYYY-MM-DD` 文字列で保存
- Node **>= 20.9**（`.nvmrc` は 24.20.0）。パスエイリアス `@/* → src/*`

### ディレクトリ

```
src/
  app/
    (app)/            認証済みレイアウト。今日/履歴/プロフィール + admin/*
    api/cron/*         generate-tasks / check-overdue / slack-daily-plan / slack-closing-summary
    login, auth/*, pending
  components/          ui/（Card,Button,Badge,Alert,Field,Stat,ProgressBar,Skeleton,EmptyState）
                       layout/ today/ master/ history/ admin/
  config/constants.ts  enum・ラベル・既定値
  lib/
    cleaning/          recurrence（頻度判定）/ generate / run-generation / progress / stats / slots / status
    slack/             notify（Webhook POST）/ messages（文面生成・純関数）
    data/              mappers / masters / tasks / stats-data / settings / *-actions（Server Actions）
    auth/guard.ts      requireMember / requireAdmin / assertAdmin
    date/jst.ts        JST 日付ユーティリティ
    supabase/          server / client / middleware / admin
supabase/migrations/   0001_init.sql / 0002_storage.sql
scripts/               seed.ts / set-admin.ts
docs/DESIGN.md         設計ドキュメント
```

---

## 3. Supabase 設定

1. [supabase.com](https://supabase.com) でプロジェクトを作成。
2. **SQL Editor** で以下を順に実行:
   1. `supabase/migrations/0001_init.sql` … テーブル / インデックス / 外部キー / トリガー / RLS / 初期カテゴリー・清掃場所
   2. `supabase/migrations/0002_storage.sql` … `cleaning-photos` バケット（非公開）と Storage RLS
3. **Project Settings → API** から URL / anon key / service_role key を控える（→ 環境変数へ）。
4. **Authentication → Providers → Email** を有効化。動作確認だけならメール確認を無効化しておくと楽です。

### 認証と最初の管理者

- `0001_init.sql` は `auth.users` に INSERT トリガーを張り、`public.users` を自動作成します。
  **1人目のユーザーは自動的に管理者（`role=admin` / `active=true`）** になります。
- 2人目以降は `role=staff` / `active=false`（**管理者の承認待ち**）で作成され、
  管理者が「スタッフ管理」画面で承認すると利用できるようになります。
- `auth.users` へのトリガー作成が許可されない環境では、アプリ側が `public.users` 行を
  最小限（staff / 非アクティブ）で自動作成します。その場合の最初の管理者は
  `scripts/set-admin.ts`（→ 「10. 管理者作成方法」）で昇格してください。

### RLS（Row Level Security）方針

全テーブルで RLS 有効。判定は SECURITY DEFINER 関数 `is_admin()` / `is_active_member()`。

| テーブル | 参照 | 追加・更新・削除 |
|---|---|---|
| `users` | 本人 or 在籍メンバー | 本人（表示名/電話のみ）/ 管理者。ロール・在籍の自己変更と「最後の管理者」降格はトリガーで拒否 |
| `cleaning_categories` / `cleaning_areas` / `cleaning_master` / `cleaning_schedules` | 在籍メンバー | 管理者のみ |
| `cleaning_tasks` | 在籍メンバー | 追加/削除=管理者、更新（開始・完了）=在籍メンバー |
| `cleaning_logs` | 在籍メンバー | 追加=本人（`actor_id = auth.uid()`）、削除=管理者、更新不可 |
| `cleaning_photos` | 在籍メンバー | 追加=本人、削除=管理者 or アップロード者 |
| `store_settings` | 在籍メンバー | 管理者のみ |
| `notification_settings` | 管理者のみ（Webhook URL を含むため） | 管理者のみ |
| Storage `cleaning-photos` | 在籍メンバー（署名付きURLで表示） | 追加=在籍メンバー、削除=管理者 or 所有者 |

Cron は Cookie セッションを持たないため **service_role（`createAdminClient`）** で RLS を跨ぎます。
service_role を使うのは Cron 4経路と `scripts/*` のみで、クライアントには一切渡しません。

---

## 4. 環境変数

`.env.local.example` を `.env.local` にコピーして設定します（`.env*.local` は `.gitignore` 済み）。
**秘密情報はソースコードに直接書かず、必ず環境変数で管理します。**

| 変数 | 必須 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **サーバー専用**。Cron・seed のみ使用。`NEXT_PUBLIC_` を付けない |
| `CRON_SECRET` | ✅ | Cron API の Bearer 認証シークレット（長いランダム文字列）。未設定だと Cron は 401 |
| `NEXT_PUBLIC_SITE_URL` | 任意（LINE 使用時は実質必須） | 本番 URL（Slack/LINE 通知内リンク・LIFF リダイレクト用） |
| `SLACK_WEBHOOK_URL` | 任意 | 初期値。通常は画面（管理者 → 通知設定）で登録・変更 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 使用時 | Messaging API チャネルの長期アクセストークン。**サーバー専用** |
| `LINE_CHANNEL_SECRET` | LINE 使用時 | Webhook 署名検証用。**サーバー専用** |
| `LINE_LOGIN_CHANNEL_ID` | 任意 | LIFF の ID トークン検証時の audience チェック |
| `NEXT_PUBLIC_LIFF_ID` | LINE 使用時 | LIFF アプリ ID（公開。SDK 初期化に使用） |
| `SEED_ADMIN_EMAIL` | 任意 | `npm run seed` で管理者に昇格させるメールアドレス |

LINE のトークン/シークレットは管理画面「通知設定」から DB に保存することも可能ですが、**env を優先**します（推奨: env に置く。ブラウザには一切露出しません）。

env は **import 時ではなく使用時に検証**します（`src/lib/env.ts`）。未設定でもビルド・テストは通ります。

---

## 5. Slack 設定

1. Slack で App を作成 → **Incoming Webhooks** を有効化 → 投稿先チャンネルを選んで
   Webhook URL（`https://hooks.slack.com/services/...`）を発行。
2. アプリに管理者でログイン → **Slack通知設定** で:
   - 「Slack 通知を有効にする」をオン
   - Webhook URL を貼り付けて保存
   - 「テスト送信」で疎通確認
   - 送信する通知（当日予定 / 未実施 / 閉店時結果）を選択
3. 実際の投稿は **すべてサーバー側の Cron から** 行われます（クライアントからは送信しません）。

送信内容:
- **本日の清掃予定**（朝8:00）: 時間帯ごとに清掃名を列挙
- **清掃未実施**（`check-overdue` が新規の期限超過を検知したとき）: 予定時刻・担当。1件につき1回だけ
- **本日の清掃結果**（夜23:00）: 予定 / 完了 / 未実施 / 完了率 ＋ 未実施項目名

二重送信は `cleaning_notification_settings.last_daily_plan_on` / `last_closing_summary_on` と
`cleaning_tasks.overdue_notified_at` で防止。`?force=1` で無視、`?dry=1` で送信せず生成結果のみ返します。

**Slack設定は清掃専用**（`cleaning_notification_settings` テーブル、migration `0008`）。
同じ Supabase プロジェクトを棚卸し管理システム等と共有している場合でも、清掃側でWebhook URLを
保存・変更しても他システムの設定には一切影響しません（逆も同様）。旧 `notification_settings`
テーブルは他システムが使っている可能性があるため変更していません（LINE関連の `line_*` 列だけは
清掃専用のため、引き続きそちらに保存されます）。

---

## 5-B. LINE 公式アカウント連携（LIFF + 担当者への個別 Push）

**目的**: 店舗全員へ同じ通知を送るのではなく、「その日その清掃を担当するスタッフ本人だけに、
その人の担当だけ」を LINE に届ける。スタッフは LINE を見るだけで今日の担当が分かり、
完了操作が必要なときだけ LIFF を開く。

### セットアップ

> LINE は **HTTPS の公開URL必須**（Webhook・LIFF とも）。先にデプロイして `NEXT_PUBLIC_SITE_URL`
> を実URLにしてから設定する。以降 `https://<本番URL>` を `<SITE>` と書く。

1. **LINE Developers Console** で **1つのプロバイダー**に作成:
   - **Messaging API チャネル**（公式アカウント）
     - チャネルアクセストークン（長期）→ `LINE_CHANNEL_ACCESS_TOKEN`
     - チャネルシークレット → `LINE_CHANNEL_SECRET`
   - **LINE Login チャネル**（LIFF 用。Messaging API と**同じプロバイダー**）
     - チャネルID → `LINE_LOGIN_CHANNEL_ID`（推奨。無くてもアクセストークン検証にフォールバック）
   - **LIFF アプリ**（LINE Login チャネルの「LIFF」タブ → 追加）
     - **エンドポイント URL = `https://<SITE>/liff`**（プレフィックス。`/today` にしない）
     - サイズ = Full
     - **scope = `openid` ＋ `profile` を必ず両方**（`openid` が無いと `getIDToken()` が null）
     - 発行された **LIFF ID** → `NEXT_PUBLIC_LIFF_ID`（設定後に再デプロイ）
2. 環境変数（Vercel）に上記＋既存（`NEXT_PUBLIC_SITE_URL` / `CRON_SECRET` / Supabase の
   **`SUPABASE_SERVICE_ROLE_KEY` も必須**）を登録 → **再デプロイ**。
3. マイグレーション `0003_line_roles.sql` → `0004_line_accounts.sql` を Supabase で実行。
4. Messaging API チャネルの **Webhook URL** = `https://<SITE>/api/line/webhook` に設定し **Webhook をオン**。
   LINE Official Account Manager で **応答モード = Bot / 応答メッセージ = オフ**（あいさつは任意）。
   「検証」ボタンで `{"ok":true}` が返ればOK。
5. 管理画面 **通知設定 → LINE 通知設定**: 「有効にする」＋（env に置かない場合のみ）トークン/シークレット、
   朝/進捗/閉店の時刻、未実施オフセット（例 `-30, 0, 30`）、**役職 × 5種別のマトリクス**。保存。
   スタッフ管理で各スタッフの **役職** を設定。
6. `vercel.json` の cron（`line-morning` / `line-progress` / `line-reminder` / `slack-closing-summary`）が配信を実行。

> **トーク内のボタン/リンクは `https://liff.line.me/<LIFF_ID>/register` 等のディープリンク**を送ります
> （`getLiffLink()`）。素の `https://<SITE>/liff/...` を貼ると通常 Webビューで開き ID トークンが取れません。
> このため LIFF エンドポイント URL は必ず `https://<SITE>/liff`（プレフィックス）にしてください。

### スタッフ登録フロー（なりすまし対策込み）

```
友だち追加 → follow Webhook 受信 → 「スタッフ登録」ボタン（liff.line.me/<LIFF_ID>/register）
  → LINE アプリ内で LIFF が開く → getIDToken() / getAccessToken() をサーバーへ送信
  → サーバーが LINE Platform で検証（ID トークン: /oauth2/v2.1/verify、
     失敗時はアクセストークン: /v2/profile へフォールバック）
  → 検証済み userId ↔ 選択した staff を staff_line_accounts に紐付け（line_user_id は UNIQUE）
```

※ Webhook 設定**前**に既に友だち追加済みだと follow は再発火しません。その場合は
  ブロック→再追加、または `https://liff.line.me/<LIFF_ID>/register` を直接開く。

- **クライアントから来た userId は信用しません。** すべての LIFF API（`/api/liff/*`）は
  `x-line-id-token`（無ければ `x-line-access-token`）を受け取り、サーバーで検証して本人の
  `staff_id` を確定します。URL パラメータで staff を渡す方式は使いません。
- LIFF が使えないスタッフ向けに、管理画面（スタッフ管理 → 詳細）で **スタッフコード** を発行でき、
  LINE でそのコードを送信しても連携できます。
- **ブロック（unfollow）** 時は `staff_line_accounts.is_active=false` / `blocked_at` のみ更新。
  スタッフ情報・清掃データは削除しません。再フォローで自動復帰します。

### 通知の出し分け（役職 = `users.job_title`）

| 役職 | 朝の清掃予定 | 途中進捗 | 未実施/期限超過 | 閉店後レポート |
|---|---|---|---|---|
| `staff` 一般スタッフ | **自分の担当だけ**（Flex） | − | 自分の担当分のみ | − |
| `cleaning_leader` 清掃リーダー | 全体スケジュール（誰が・何時までに・どこを・状態） | ○ | スコープ内をまとめて | ○ |
| `hall_leader` ホールリーダー | ホール系（`side = hall/other`）のスケジュール。管理画面で範囲変更可 | 既定− | ホール系をまとめて | 既定− |
| `manager` 店長 | 全体スケジュール ＋ 管理サマリ（未実施/超過/担当未設定） | ○ | 全件をまとめて | ○ |

- **同一人物が担当者本人 かつ リーダー** でも二重送信しません（`line_user_id` 単位で1通に集約。
  リーダーは全体スケジュール1通に自分の担当も含まれる）。
- 役職 × 通知種別（**朝の清掃予定 / 途中進捗 / 未実施 / 期限超過 / 閉店後レポート** =
  `morning` / `progress` / `pending` / `overdue` / `closing`）の ON/OFF は
  `notification_settings.line_role_prefs`（管理画面「通知設定」のマトリクス）で変更できます。
- 「リーダー・店長が確認すべきは基本的に **未実施 / 期限超過 / 担当未設定** の例外」という方針。
  途中進捗と閉店後レポートは例外項目を先頭に、朝のダイジェストは末尾に管理サマリを付けます。
- **出勤ゲート**: `staff` / `cleaning_leader` / `hall_leader` は、その通知の対象日に
  `daily_staffing`（出勤・清掃割当画面、またはシフト取込）へ登録されているスタッフにしか
  送信しません（休みの日には送らない）。`manager` は出勤登録に関係なく常に対象です。
  対象日の `daily_staffing` が1件も無い（出勤データ未設定）日は制限をかけず全員へ送ります
  （後方互換のフェイルオープン）。純関数 `isOnDutyForNotification()`（`src/lib/line/recipients.ts`）。

**途中進捗の例**（`line-progress` cron）:
```
【清掃進捗】

17:00現在

予定
12件
完了
8件
未実施
4件
完了率
67%

■ 未実施

冷蔵庫内部
担当：磯山
期限：17:00
...
```

### LIFF 画面（`/liff/*`）

- `/liff/register` … スタッフ選択 or コード入力
- `/liff/today` … 本人の当日タスクのみ。進捗（3件中1件完了 / 33%）＋ カード（清掃開始 → 完了）。
  写真必須の清掃はカメラ撮影→アップロード（クライアントで長辺1600pxへ縮小 → サーバーが
  service_role で Supabase Storage に保存）。全完了で「本日の担当清掃がすべて完了しました」。
- 1件完了ごとの LINE 通知は送りません（LIFF 内に「完了しました」と表示するだけ）。

### 将来拡張（設計済みの逃げ道）

- **リッチメニュー**（今日の清掃 / スケジュール / 履歴）… LIFF URL を貼るだけ。表示は本人分に限定済み。

### シフト連携（タニタ柏シフトCSV取込）と自動割当（`/admin/shift-import`）

「シフト連携」は実装済みです。タニタ柏シフトの「取込用」CSV（`date,name,role,start_time,end_time,...`）を
アップロード（または貼り付け）すると、日付・氏名ごとに行を統合し、`role` 列の `H`=ホール /
`K`=キッチン / `H・K`=兼務 を読み取って `daily_staffing`（出勤・清掃割当の母集団）へ反映します。

- 純パーサ `src/lib/shift/tanita.ts`（`parseTanitaShiftCsv` / `mapTanitaRoleToPositions`）。
  UTF-8 として厳密デコードし失敗したら Shift_JIS で読み直し（`ShiftImportWizard.tsx`）。
- 氏名解決は **プレビュー → 確認の2段階**（`src/lib/data/shift-import-actions.ts`）:
  1. `users.display_name` と完全一致
  2. 一致しなければ `shift_name_aliases`（過去に手動で選んだマッピング）
  3. それでも未解決ならプレビュー画面で管理者がスタッフを選択（選ぶと以後は自動解決・
     `shift_name_aliases` に恒久保存）。「スキップ」を選んだ名前は取り込みません。
- 確認すると、CSVに含まれる**日付ごとに** `daily_staffing` を丸ごと置き換えます（手動編集分も
  上書き。「出勤・清掃割当」画面の手動編集と同じ `replaceDailyStaffingForDate()` を共有）。
- **アプリ未登録スタッフの自動登録**: LINE通知を受け取るのは店長・管理者・ホール/清掃リーダーなど
  数名だけで、一般スタッフの大半はアプリアカウント（ログイン）を持たない運用を想定。
  `users.display_name` にも `shift_name_aliases` にも一致しない氏名は、既定で
  **ログイン・LINE通知を使わない「シフト連携のみ」の `users` 行**として自動登録されます
  （`has_login=false`、`role='staff'`、`active=true`。`/admin/staff` に「シフト連携のみ」バッジ
  で表示）。表記ゆれで実は既存スタッフの場合のみ、プレビュー画面で既存スタッフを選び直せます。
  これにより `daily_staffing` / 清掃の自動割当は登録済み・未登録を区別せず同じ母集団として扱えます。
- **兼務（H・K）対応**: `daily_staffing.positions`（`text[]`）に複数ポジションを保持。
  自動割当（`src/lib/cleaning/assign.ts`）は兼務スタッフをホール・キッチンどちらのタスクの
  候補にもします（旧・単一 `position` 列は代表ポジションとして表示用に残置）。
- **シフトの勤務時間による制約**: CSVの `start_time`/`end_time`（`daily_staffing.start_time`/
  `end_time`）も自動割当に使われます。清掃タスクの期限（`cleaning_tasks.due_at`）の時刻に
  勤務していないスタッフ（例: 17:00〜22:00 出勤なのに 11:00 期限のタスク）は候補から除外され、
  その時刻に勤務中のスタッフだけが割り当てられます。既に割り当て済みでも、シフト変更等で
  勤務時間外になった場合は再割当されます。勤務時間が未設定（`null`）のスタッフはこの制約を
  受けません（後方互換）。
- 取込のたびに `shift_import_logs` へ件数・未解決名を記録。

## 5-C. 完了レポート（週次・月次PDF、`/reports`）

清掃の完了実績をPDFで出力する機能。LINE個別通知を使わない運用（Slack一本化）でも、
清掃リーダーが週末・月末にこのPDFをダウンロードして、普段使っているグループ（LINEグループ等）
へ手動で共有することを想定（アプリからの自動送信は行わない）。

- アクセス権限: `role=admin` または `job_title=cleaning_leader`（`requireReportViewer()`、
  `src/lib/auth/guard.ts`）。清掃リーダーは `role=staff` のままでもこの画面だけアクセス可能
  （他の `/admin/*` 画面は従来どおり `role=admin` 限定）。ナビの表示も
  `src/components/layout/nav-items.ts` の `cleaningLeaderOk` フラグで同じ条件に合わせている。
- 画面 `/reports`: 今週・今月のサマリー（予定/完了/未実施/完了率）をオンスクリーンで確認し、
  「PDFでダウンロード」リンクから `GET /api/reports/weekly` / `GET /api/reports/monthly`
  （`?date=YYYY-MM-DD` でその日を含む週/月を指定可。省略時は今日基準）を叩く。
- 生成は**オンデマンド**（ボタンを押した時にその場でPDFを生成して返す）。Cronによる自動生成・
  自動配信はしていない（必要になれば `/api/reports/*` のロジックをCronからも呼べる）。
- 集計ロジックは既存の清掃漏れ分析と同じ純関数を再利用（`src/lib/cleaning/stats.ts` の
  `overallCompletion` / `completionByArea` / `missRanking` / `missedByWeekday` /
  `implementationByStaff`）。期間計算は `src/lib/reports/period.ts`
  （週は月曜始まり）、レポート構造への集約は `src/lib/reports/build-report.ts`。
- PDF描画: `@react-pdf/renderer` ＋ 日本語フォント `noto-sans-cjk-jp`（`src/lib/reports/
  pdf-document.tsx` / `render-pdf.ts`）。**`next.config.mjs` の `serverExternalPackages` に
  `@react-pdf/renderer` と `noto-sans-cjk-jp` を追加済み**（webpackが `.woff` をJSモジュールとして
  バンドルしようとしてビルド失敗するため）。フォントパスは `require.resolve` ではなく
  `path.join(process.cwd(), "node_modules", ...)` で組み立てている（webpackの静的解析を避けるため。
  `@react-pdf/font` が実行時にこのパス文字列へ直接 `fetch()` する）。この2点は変更時に要注意。
- PDFの内容: 全体サマリー／清掃が行き届いていない場所（完了率が低い順）／よく忘れられる清掃項目／
  曜日別の予定・未実施件数（月曜始まり）／スタッフ別の完了登録数。

---

## 6. Vercel 設定

1. GitHub リポジトリを作成し push（このディレクトリをリポジトリのルートにする）。
2. Vercel で **New Project** → リポジトリを import。フレームワークは Next.js が自動検出。
3. **Settings → Environment Variables** に「4. 環境変数」の値をすべて登録
   （`CRON_SECRET` を登録すると Vercel Cron が自動で `Authorization: Bearer` を付与）。
4. Deploy。`vercel.json` の `crons` が自動で登録されます。
5. `NEXT_PUBLIC_SITE_URL` に本番 URL を設定して再デプロイ。

`next build` は lint で止まりません（`eslint.ignoreDuringBuilds`）。CI / 手元で `npm run lint` を回してください。

---

## 7. Cron 設定

`vercel.json`:

| パス | スケジュール(UTC) | JST | 役割 |
|---|---|---|---|
| `/api/cron/generate-tasks` | `5 15 * * *` | 00:05 | 当日タスク生成（`cleaning_master`/`cleaning_schedules` → `cleaning_tasks`。冪等）＋続けて自動割当（下記） |
| `/api/cron/check-overdue` | `0,30 * * * *` | 毎時0/30分 | 期限超過へ遷移 ＋ 未実施 Slack 通知（店舗全体・1チャンネル） |
| `/api/cron/line-morning` | `0,30 * * * *` | `line_morning_time`(既定09:30)±15分 | **朝の清掃予定通知**。staff=自分の担当（Flex）／リーダー・店長=全体スケジュール |
| `/api/cron/line-progress` | `0,30 * * * *` | `line_progress_times`(既定17:00)±15分 | **途中進捗通知**。予定/完了/未実施/完了率 ＋ 未実施一覧（担当・期限） |
| `/api/cron/line-reminder` | `0,30 * * * *` | 毎時0/30分 | **未実施通知**（`line_reminder_offsets`、例 -30/0/30 分）＋ **期限超過通知**。担当者へ Flex／リーダー・店長へまとめ |
| `/api/cron/slack-daily-plan` | `0 23 * * *` | 08:00 | 本日の清掃予定を Slack へ |
| `/api/cron/slack-closing-summary` | `0 14 * * *` | 23:00 | **閉店後レポート**を Slack ＋ 受信 ON の役職へ LINE（`line_closing_time`） |

- **タスク生成後の自動割当**: `generate-tasks` はタスク生成に続けて、その日の `daily_staffing`
  （シフトCSV取込・手動登録のどちらでも可）があれば `runAutoAssign()`（`src/lib/cleaning/
  run-auto-assign.ts`）で清掃タスクへ自動的に担当を割り振ります。出勤スタッフが1件も無い日
  （シフト未取込・店舗未設定）は割当をスキップするだけでタスク生成自体は失敗しません。
  月まとめてシフトを取り込んでおけば、当日分は毎晩自動で「出勤登録 → タスク生成 → 自動割当」
  まで完了し、`/admin/assignments` で手動の「自動割当」ボタンを押す必要はなくなります
  （固定担当・ロック済みタスクは維持。同じロジックを手動割当ボタンとも共有）。
- 認証: `Authorization: Bearer ${CRON_SECRET}`。未設定・不一致は **401**。認証なしでは実行できません（`?key=<CRON_SECRET>` でも可）。
- すべて **Asia/Tokyo 基準**で処理します（`src/lib/date/jst.ts`）。
- 手動テスト:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>/api/cron/generate-tasks?date=2026-09-10"
  curl "https://<your-app>/api/cron/line-morning?key=$CRON_SECRET&force=1&dry=1"
  curl "https://<your-app>/api/cron/line-progress?key=$CRON_SECRET&force=1&at=17:00&dry=1"
  ```
- クエリ: `dry=1`（送信なし）/ `force=1`（時刻・二重送信ガード無視）/ `date=YYYY-MM-DD` / `at=HH:MM`（時刻上書き）。
- LINE の重複送信は **`notification_logs.dedupe_key`（UNIQUE）** で防止。
  Slack は `cleaning_notification_settings.last_*` ＋ `cleaning_tasks.overdue_notified_at`。
- **Vercel Cron のプラン制限**: Hobby は cron 2本・1日1回。上記の 30 分間隔運用には Pro、または
  外部スケジューラ（GitHub Actions / cron-job.org 等）から各 URL を叩いてください。

---

## 8. ローカル起動方法

```bash
cd cleaning-manager
nvm use                 # あれば
npm install
cp .env.local.example .env.local   # 値を設定（Supabase 必須）
npm run dev             # http://localhost:3000
```

- `http://localhost:3000` → `/login`。「新規登録」で最初のユーザーを作成 → 自動的に管理者。
- 管理者で「清掃項目マスタ」を登録するか、`npm run seed` でデモ 20 件を投入。
- 「今日の清掃」または管理ダッシュボードの「本日分を生成」で当日タスクを作成。

### コマンド

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド（型チェック込み）
npm run start      # ビルド済みを起動
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
npm run seed       # scripts/seed.ts（デモ清掃項目 + 管理者昇格）
npm run set-admin -- you@example.com   # 管理者作成 / 復旧
```

---

## 9. 本番デプロイ方法

1. Supabase 本番プロジェクトで `0001_init.sql` → `0002_storage.sql` を実行。
2. GitHub に push → Vercel に import。
3. Vercel の環境変数を設定（`CRON_SECRET` を含む）。
4. Deploy。
5. 本番 URL で「新規登録」→ 最初のユーザーが管理者に。必要なら他メンバーを承認。
6. Slack 通知設定を行い「テスト送信」で確認。
7. 数分後、または `?key=$CRON_SECRET` を付けて Cron URL を手動で叩き、生成・通知を確認。

---

## 10. 管理者作成方法

- **通常**: アプリで最初に「新規登録」したユーザーが自動的に管理者になります
  （`auth.users` トリガー。`role=admin` / `active=true`）。
- **2人目以降を管理者にする**: 既存の管理者が「スタッフ管理」画面で対象ユーザーの
  ロールを「管理者」に変更 ＋ 承認。
- **トリガーが動かない環境 / 復旧**: サービスロールキーを `.env.local` に設定し、
  対象ユーザーが一度 `/login` で登録した後に:
  ```bash
  npm run set-admin -- admin@example.com
  # staff へ戻す場合:
  npm run set-admin -- someone@example.com --staff
  ```
- `SEED_ADMIN_EMAIL` を設定して `npm run seed` を実行しても同じ昇格が行われます。

---

## 11. データモデル（`supabase/migrations/`）

- `0001_init.sql`: `users` / `cleaning_categories` / `cleaning_areas` / `cleaning_master` /
  `cleaning_schedules` / `cleaning_tasks` / `cleaning_logs` / `cleaning_photos` /
  `notification_settings` / `store_settings`
- `0002_storage.sql`: Storage バケット `cleaning-photos` ＋ RLS
- `0003_line_roles.sql`: `users.job_title` / `staff_code` / `visible_category_ids`、
  `cleaning_categories.side`、`notification_settings` の LINE 設定列
- `0004_line_accounts.sql`: **`staff_line_accounts`**（LINE userId ↔ staff。`line_user_id` UNIQUE、
  unfollow で `is_active=false`/`blocked_at`）、**`notification_logs`**（`dedupe_key` UNIQUE で
  重複送信防止。`notification_type` / `cleaning_task_id` / `staff_id` / `line_user_id` /
  `sent_at` / `status` / `line_request_id` / `error_message`）
- `0005_cleaning_ops.sql`: `cleaning_tasks` に `assignment_locked`（自動割当で上書きしない固定）/
  `skip_reason_code` / `origin_task_id`（繰越元）、`cleaning_logs.action` に `carry_over` を追加、
  **`daily_staffing`**（当日出勤スタッフ。清掃自動割当の母集団。参照=在籍メンバー/書込=管理者）、
  **`equipment_issues`**（設備異常報告。参照=在籍メンバー/報告=本人/状態変更=管理者）
- `0006_shift_import.sql`: `daily_staffing.positions`（text[]、兼務対応。旧 `position` 列は
  代表ポジションとして残置）、**`shift_name_aliases`**（CSV氏名 → `users.id` の恒久マッピング。
  `alias` UNIQUE）、**`shift_import_logs`**（取込履歴）。いずれも管理者のみ書込
- `0007_shift_only_staff.sql`: `users.id → auth.users.id` の外部キーを削除し、
  `users.has_login`（既定 true）を追加。LINE通知の対象外でアプリのログインアカウントを
  持たない一般スタッフを、シフトCSV連携だけで `users` 行として登録できるようにする
  （`auth.users` 削除時の `public.users` 連動削除は FK cascade の代わりにトリガーで維持）
- `0008_cleaning_notification_settings.sql`: **`cleaning_notification_settings`**
  （Slack関連＋送信済み日時。`id=1` シングルトン、管理者のみ、`notification_settings` と同じ
  RLS方針）を新設。同じ Supabase プロジェクトを棚卸し管理システム等と共有しているとき、
  清掃側のSlack Webhook保存が他システムの設定を上書きしてしまう問題を解消するための分離
  （詳細は README §5「Slack設定」）。旧 `notification_settings` テーブルは変更しない
  （LINE関連の `line_*` 列は清掃専用のため、引き続きそちらに残る）

- 1店舗運用。設定（`store_settings` / `notification_settings` / `cleaning_notification_settings`）
  は `id = 1` のシングルトン行。
- 頻度は `cleaning_schedules.frequency`（`daily` / `weekday` / `weekly` / `biweekly` / `monthly` /
  `monthly_twice` / `day_of_month` / `interval` / `manual`）。1つの清掃項目に複数スケジュール可。
- `cleaning_tasks` はマスタ値の **snapshot**（`master_name` / `area_label` など）を持ち、
  マスタを変更・削除しても履歴は保持されます（`master_id` は null 化）。
- 状態: `pending` → `in_progress` → `done` ／ 期限超過で `overdue` ／ 管理者が `skipped`。
- 期限 `due_at` は生成時に「対象日 + 期限時刻」を JST として `timestamptz` 化。
  期限時刻が未設定なら時間帯（`store_settings.time_slots`）の終了時刻をフォールバック。

詳細な設計判断は `docs/DESIGN.md` を参照。

---

## 12. 将来拡張（設計上の逃げ道のみ確保）

LINE 通知 / 複数店舗管理 / NFC・QR 清掃 / AI による清掃漏れ分析・スケジュール提案 /
衛生点検・温度管理・HACCP / OJT 連携。純関数（頻度・集計・Slack 文面）は無改修で流用できます。
複数店舗化は全テーブルへ `store_id` を追加し `is_store_member(store_id)` へ RLS を差し替える設計です。
