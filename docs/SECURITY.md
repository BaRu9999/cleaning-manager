# セキュリティ確認チェックリスト

## 認証・認可

- [x] 未ログインは `middleware.ts` で `/login` へリダイレクト（`api/cron/*` は matcher で除外し `CRON_SECRET` で保護）
- [x] 承認前（`active=false`）ユーザーは `(app)/layout.tsx` で `/pending` へ
- [x] 全 `admin/*` ページ Server Component が `requireAdmin()`
- [x] スタッフ向けページは `requireMember()`
- [x] 全 Server Action が先頭で `assertAdmin()` / `assertMember()`（`src/lib/data/*-actions.ts`）
- [x] RLS はデータ保護の最終防衛線。UI・サーバーガードは早期拒否と体験のため（多層防御）

## RLS（`supabase/migrations/0001_init.sql`）

- [x] 全テーブルで `enable row level security`
- [x] 判定は SECURITY DEFINER 関数 `is_admin()` / `is_active_member()`（再帰ポリシー回避）
- [x] マスタ系の書き込みは管理者のみ、参照は在籍メンバー
- [x] `notification_settings` / `cleaning_notification_settings` は参照も管理者のみ
  （Webhook URL を含むため）。清掃のSlack設定は `cleaning_notification_settings`（清掃専用、
  他システムと非共有）、LINE設定（`line_*`）のみ引き続き `notification_settings`
- [x] `cleaning_logs` は追記のみ（`actor_id = auth.uid()` を強制、UPDATE ポリシーなし）
- [x] 権限昇格防止トリガー `guard_users_write`（自分のロール/在籍の変更禁止、最後の管理者の降格禁止）
- [x] `users.has_login=false`（シフトCSV連携のみで自動登録されたスタッフ）は `auth.users` に
  対応行が無く、`auth.uid()` が一致することは原理上あり得ない＝ログイン・なりすまし不可。
  `is_admin()` / `is_active_member()` は変更不要（`auth.uid()` 一致判定のまま）
- [x] Storage バケット `cleaning-photos` は非公開。閲覧はサーバー発行の署名付きURL（1時間）
- [x] `daily_staffing`（参照=在籍メンバー/書込=管理者）、`shift_name_aliases` /
  `shift_import_logs`（いずれも管理者のみ全操作）も同じ `is_admin()` / `is_active_member()` パターン

## 秘密情報

- [x] 秘密情報はソース非埋め込み。すべて環境変数（`src/lib/env.ts`、使用時検証）
- [x] `SUPABASE_SERVICE_ROLE_KEY` は `NEXT_PUBLIC_` を付けず、`src/lib/supabase/admin.ts` 経由のみ
- [x] service_role を使うのは Cron 4経路 + `scripts/*` のみ。クライアントに渡さない
- [x] `.env*.local` は `.gitignore` 済み
- [x] Cron API は `Authorization: Bearer ${CRON_SECRET}`。未設定・不一致は 401（認証なしで実行不可）

## 入力検証

- [x] Server Action の入力は Zod で検証（`src/lib/validation/`、各 action 内）
- [x] 写真必須の清掃はサーバー側で写真枚数を確認し、0枚なら完了を拒否
- [x] 状態遷移は `canTransition()` と各 action のガードで二重チェック
- [x] Slack Webhook URL は `https://hooks.slack.com/` 前方一致を検証

## LINE 公式アカウント / LIFF

- [x] **クライアントの userId を信用しない**。`/api/liff/*` は `x-line-id-token`（無ければ
  `x-line-access-token`）を受け取り、LINE Platform（`api.line.me/oauth2/v2.1/verify` /
  `/v2/profile`）で検証してから `staff_id` を確定（`src/lib/liff/session.ts`）
- [x] ID トークンの `aud`（= LINE Login チャネル ID）と `exp` を検証（`LINE_LOGIN_CHANNEL_ID` 設定時）
- [x] LIFF の清掃操作は URL パラメータで staff を渡さない。必ず認証情報 → `task.assignee_id` 一致を確認
- [x] Webhook は `x-line-signature`（HMAC-SHA256, channel secret）を `timingSafeEqual` で検証。不一致は 401
- [x] `staff_line_accounts.line_user_id` に UNIQUE 制約（1 LINE ↔ 1 staff）。`staff_id` も UNIQUE
- [x] unfollow（ブロック）は `is_active=false` / `blocked_at` のみ。データは削除しない
- [x] LINE の重複送信は `notification_logs.dedupe_key`（UNIQUE）で防止。送信直前に claim
- [x] Channel Access Token / Secret はサーバーのみ（env 優先）。`NEXT_PUBLIC_` は LIFF ID だけ
- [x] LIFF 写真アップロードは Storage キーをブラウザに出さず、サーバーが service_role で保存
- [x] `staff_line_accounts` RLS: 参照=在籍メンバー、変更=管理者 or 本人（`staff_id = auth.uid()`）。
  `notification_logs` RLS: 管理者のみ（書き込みは service_role の Cron）
- [x] `middleware` matcher は `api/cron` / `api/line` / `api/liff` を除外（各自で認証）。
  `/liff/*` ページは Supabase セッション不要（PUBLIC_PREFIXES）

## 既知の割り切り（単一店舗・信頼済みスタッフ 10〜30名 前提）

- `users.id → auth.users.id` の外部キーは `0007_shift_only_staff.sql` で削除済み
  （シフト連携のみのスタッフを `auth.users` 無しで登録するため）。実アカウント側の
  「認証ユーザー削除で連動削除」という挙動は `trg_auth_user_deleted` トリガーで代替している。
- **このSupabaseプロジェクトは棚卸し管理システム等、他アプリと共有される場合がある**。
  `notification_settings` は旧来そのまま共有されており、新しい共有列を追加する際は
  「他システムが同じ行・同じ列を読み書きしていないか」を必ず確認すること
  （過去に `slack_webhook_url` の競合で `0008_cleaning_notification_settings.sql` の分離が
  必要になった。詳細は docs/DESIGN.md §9-D）。

- `cleaning_tasks` の UPDATE は在籍メンバーなら誰でも可（他人のタスクも完了登録できる）。
  実際に書き込まれる値は Server Action が制御。列単位の制限が必要になれば
  SECURITY DEFINER RPC に寄せる。
- `auth.users` トリガーが使えない環境では最初の管理者を `npm run set-admin` で作成する。
