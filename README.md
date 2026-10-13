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
- **Vitest**（`src/**/*.test.ts`, node 環境） … 頻度エンジン・生成・集計・Slack 文面の純関数を検証
- 通知: **Slack Incoming Webhook**（サーバー側のみ）
- デプロイ: **Vercel** ＋ **Vercel Cron**
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
supabase/migrations/   0001_init.sql / 0002_storage.sql / 0003_cleaning_notification_settings.sql
scripts/               seed.ts / set-admin.ts
docs/DESIGN.md         設計ドキュメント
```

---

## 3. Supabase 設定

1. [supabase.com](https://supabase.com) でプロジェクトを作成。
2. **SQL Editor** で以下を順に実行:
   1. `supabase/migrations/0001_init.sql` … テーブル / インデックス / 外部キー / トリガー / RLS / 初期カテゴリー・清掃場所
   2. `supabase/migrations/0002_storage.sql` … `cleaning-photos` バケット（非公開）と Storage RLS
   3. `supabase/migrations/0003_cleaning_notification_settings.sql` … 清掃専用の通知設定・RLS
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
| `cleaning_notification_settings` | 管理者のみ（Webhook URL を含むため） | 管理者のみ |
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
| `NEXT_PUBLIC_SITE_URL` | 任意 | 本番 URL（Slack 通知内リンク用） |
| `SLACK_WEBHOOK_URL` | 任意 | 初期値。通常は画面（管理者 → Slack通知設定）で登録・変更 |
| `SEED_ADMIN_EMAIL` | 任意 | `npm run seed` で管理者に昇格させるメールアドレス |

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
| `/api/cron/generate-tasks` | `5 15 * * *` | 00:05 | 当日タスク生成（冪等） |
| `/api/cron/check-overdue` | `0,30 * * * *` | 毎時0/30分 | 期限超過へ遷移 ＋ 未実施 Slack 通知 |
| `/api/cron/slack-daily-plan` | `0 23 * * *` | 08:00 | 本日の清掃予定を Slack へ |
| `/api/cron/slack-closing-summary` | `0 14 * * *` | 23:00 | 本日の清掃結果を Slack へ |

- 認証: `Authorization: Bearer ${CRON_SECRET}`。未設定・不一致は **401**。認証なしでは実行できません。
- 手動テスト（`?key=` でも認証可）:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" \
    "https://<your-app>/api/cron/generate-tasks?date=2026-09-10"
  curl "https://<your-app>/api/cron/slack-daily-plan?key=$CRON_SECRET&dry=1"
  ```
- クエリ: `dry=1`（Slack 送信なし）/ `force=1`（二重送信・冪等ガード無視）/ `date=YYYY-MM-DD`。
- **Vercel Hobby プランは Cron が1日1回に制限**されます。`check-overdue` を高頻度で回すには
  Pro プラン、または外部スケジューラ（例: GitHub Actions, cron-job.org）から上記 URL を叩いてください。

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

1. Supabase 本番プロジェクトで `0001_init.sql` → `0002_storage.sql` → `0003_cleaning_notification_settings.sql` を実行。
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

`users` / `cleaning_categories` / `cleaning_areas` / `cleaning_master` / `cleaning_schedules` /
`cleaning_tasks` / `cleaning_logs` / `cleaning_photos` / `cleaning_notification_settings` / `store_settings`

- 1店舗運用。設定（`store_settings` / `cleaning_notification_settings`）は `id = 1` のシングルトン行。
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

## 13. 棚卸しと清掃の Slack 設定の分離（既存環境の更新）

同じ Supabase を利用するアプリが `notification_settings` の `id=1` を共用すると、
Webhook URL と通知の有効/無効を上書きし合います。清掃側は追加マイグレーションで
`cleaning_notification_settings` に独立させます。棚卸し側の変更は不要です。

1. Preview DB で `supabase/migrations/0003_cleaning_notification_settings.sql` を実行。
2. この変更を含む清掃アプリを Preview にデプロイ。
3. 清掃の「Slack通知設定」で清掃用 URL と通知の有効/無効を登録。
   共有されていた URL は用途を断定できないためコピーしません。登録まで清掃通知は停止します。
   清掃の通知種別と最終送信日は引き継ぎます。
4. 清掃の URL を変更・削除・無効化しても棚卸し側が変わらず、逆方向も同様であることを確認。
   テスト送信は実際に Slack に投稿するため、確認済みの送信先で別途実施してください。
5. 本番反映時も **DB → 清掃アプリ → 清掃用 URL の登録・有効化** の順で実施。
   既に棚卸し側の URL が上書きされていた場合、棚卸し側で正しい URL を登録し直してください。

旧 `notification_settings` の行・テーブル・RLS は変更・削除しません。
新テーブルは管理者のみ読み書き可能で、Cron は従来どおり service_role でアクセスします。
新テーブルが未作成・未設定でも旧テーブルへのフォールバックはしません。
SQL の再実行で清掃側の登録済み URL を上書きすることはありません。
アプリだけ旧版へ戻すと共有設定に再接続するため、ロールバック時は清掃側の通知と設定変更を
停止してから戻してください。旧テーブルや棚卸し側を削除・初期化しないでください。
