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
- [x] `notification_settings` は参照も管理者のみ（Webhook URL を含むため）
- [x] `cleaning_logs` は追記のみ（`actor_id = auth.uid()` を強制、UPDATE ポリシーなし）
- [x] 権限昇格防止トリガー `guard_users_write`（自分のロール/在籍の変更禁止、最後の管理者の降格禁止）
- [x] Storage バケット `cleaning-photos` は非公開。閲覧はサーバー発行の署名付きURL（1時間）

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

## 既知の割り切り（単一店舗・信頼済みスタッフ 10〜30名 前提）

- `cleaning_tasks` の UPDATE は在籍メンバーなら誰でも可（他人のタスクも完了登録できる）。
  実際に書き込まれる値は Server Action が制御。列単位の制限が必要になれば
  SECURITY DEFINER RPC に寄せる。
- `auth.users` トリガーが使えない環境では最初の管理者を `npm run set-admin` で作成する。
