# 串在庫管理アプリ v2 — ハンドオフドキュメント

最終更新: 2026-05-25

---

## アプリ概要

Vue 3 + Supabase で構築した焼き鳥店向け在庫・営業管理アプリ。
GAS + Spreadsheet 構成からの全面刷新版。

- **本番URL**: https://masudabizzz-create.github.io/yakitori-app-v2/
- **Supabase プロジェクト**: `mmquefvklrxjcmoxgvjb`
- **GitHub リポジトリ**: https://github.com/masudabizzz-create/yakitori-app-v2

---

## 技術スタック

| レイヤー | 技術 |
|--------|------|
| フロントエンド | Vue 3 (Composition API) + Vite + Tailwind CSS v3 |
| 状態管理 | Pinia |
| ルーター | Vue Router 4（**hash モード**） |
| バックエンド | Supabase (PostgreSQL + Auth + Edge Functions + RLS) |
| テスト | Vitest + Vue Test Utils（84テスト） |
| CI/CD | GitHub Actions → GitHub Pages 自動デプロイ |
| 通知 | LINE Messaging API（broadcast） |

---

## ディレクトリ構成

```
yakitori-app-v2/
├── frontend/                 ← Vue 3 フロントエンド
│   ├── src/
│   │   ├── lib/
│   │   │   ├── supabase.ts   ← Supabase クライアント
│   │   │   └── fn-error.ts   ← Edge Function エラー抽出ユーティリティ
│   │   ├── stores/
│   │   │   ├── auth.ts       ← 認証（セッション・ロール管理）
│   │   │   ├── users.ts      ← スタッフ管理（QR招待・削除）
│   │   │   ├── tenants.ts    ← 店舗管理
│   │   │   ├── settings.ts   ← システム設定（LINE トークン等）
│   │   │   ├── skewers.ts    ← 串マスタ
│   │   │   └── dailyLog.ts   ← 営業後ログ
│   │   ├── views/            ← 画面
│   │   │   ├── LoginView.vue
│   │   │   ├── RegisterView.vue  ← QRコード自己登録
│   │   │   ├── HomeView.vue
│   │   │   ├── InputView.vue     ← 営業後入力
│   │   │   ├── DashboardView.vue ← 仕込みダッシュボード
│   │   │   ├── AnalyticsView.vue ← 分析・集計
│   │   │   ├── OrderView.vue     ← 発注推定
│   │   │   ├── OpsAdminView.vue  ← 運用管理
│   │   │   └── SysAdminView.vue  ← システム管理
│   │   ├── components/
│   │   │   ├── sys/
│   │   │   │   ├── SysStaffTab.vue    ← QR発行・スタッフ編集・削除
│   │   │   │   ├── SysTenantsTab.vue  ← 店舗管理
│   │   │   │   └── SysSettingsTab.vue ← システム設定
│   │   │   └── ops/                  ← 運用管理コンポーネント群
│   │   ├── router/index.ts   ← ルート定義・認証ガード
│   │   └── types/index.ts    ← 全型定義
│   └── tests/unit/           ← Vitest ユニットテスト（84件）
├── supabase/
│   ├── functions/
│   │   ├── manage-users/     ← スタッフ・店舗管理 Edge Function
│   │   └── send-line/        ← LINE 通知 Edge Function
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       ├── 003_seed_data.sql
│       ├── 004_new_roles_and_invitations.sql
│       ├── 005_qr_invitation.sql
│       └── cleanup_test_users.sql  ← テストユーザー削除用（要手動実行）
└── SETUP.md                  ← セットアップ手順詳細
```

---

## ロール設計

| ロール | 説明 | アクセス範囲 |
|--------|------|------------|
| `super_admin` | スーパー管理者 | 全機能 |
| `tenant_admin` | テナント管理者 | 全機能（super_admin と同等） |
| `admin` | 管理者 | システム管理・運用管理・全画面 |
| `manager` | マネージャー | 運用管理・全画面 |
| `user` | スタッフ | 入力・ダッシュボード・分析・発注 |
| `kitchen` | キッチン | 入力・ダッシュボード・分析・発注 |
| `hall` | ホール | 入力・ダッシュボード・分析・発注 |

---

## スタッフ登録フロー（QRコード方式）

```
管理者
  └─ システム管理 > スタッフ管理 > 役割選択 > 「QRコードを発行する」
        ↓ manage-users Edge Function (create_qr_invitation)
        ↓ user_invitations テーブルに token + expires_at を保存
        ↓ QR画像を画面に表示（24時間有効・使い捨て）

スタッフ（QRを読み取る）
  └─ /#/register?token=xxx が開く
        ↓ validate_token で有効性確認
        ↓ 名前・メール・パスワードを入力
        ↓ manage-users Edge Function (register_with_token)
        ↓ Auth ユーザー作成（email_confirm: true / 即時有効）
        ↓ public.users に挿入
        ↓ invitation status → 'used'
        ↓ 登録完了 → 自動でログイン画面へ遷移（1.5秒後）
```

**メール確認**: OFF（Supabase Dashboard > Authentication > Confirm email を無効化済み）

---

## Edge Functions

### manage-users
**URL**: `https://mmquefvklrxjcmoxgvjb.supabase.co/functions/v1/manage-users`

| アクション | 認証 | 説明 |
|-----------|------|------|
| `validate_token` | 不要 | QRトークン有効性確認 |
| `register_with_token` | 不要 | QRトークンで自己登録 |
| `create_qr_invitation` | admin以上 | QR招待発行 |
| `reject_invitation` | admin以上 | QRトークン無効化 |
| `delete_user` | admin以上 | スタッフ削除 |
| `create_tenant` | admin以上 | 店舗作成 |
| `update_tenant` | admin以上 | 店舗名更新 |
| `delete_tenant` | admin以上 | 店舗削除 |

### send-line
**URL**: `https://mmquefvklrxjcmoxgvjb.supabase.co/functions/v1/send-line`

LINE Messaging API 経由でブロードキャスト送信。`settings.line_token` を使用。

---

## 画面一覧

| パス | 画面名 | 最低ロール | 説明 |
|-----|--------|----------|------|
| `/login` | ログイン | - | 認証不要 |
| `/register` | スタッフ登録 | - | QRトークン必須・認証不要 |
| `/` | ホーム | 認証済み | ナビゲーション |
| `/input` | 営業後入力 | user | 日次ログ入力・LINE通知 |
| `/dashboard` | 仕込みダッシュボード | user | 在庫・仕込み量表示 |
| `/analytics` | 分析・集計 | user | 売上・傾向分析 |
| `/order` | 発注推定 | user | 次回発注量計算 |
| `/admin/ops` | 運用管理 | manager | 串マスタ・発注スケジュール |
| `/admin/sys` | システム管理 | admin | スタッフ・店舗・設定管理 |

---

## DB マイグレーション実施状況

| ファイル | 内容 | 状態 |
|---------|------|------|
| `001_initial_schema.sql` | 全テーブル + インデックス | ✅ 実施済み |
| `002_rls_policies.sql` | RLS（テナント分離 + ロール制御） | ✅ 実施済み |
| `003_seed_data.sql` | デフォルトテナント・設定 | ✅ 実施済み |
| `004_new_roles_and_invitations.sql` | 7ロール + 招待テーブル | ✅ 実施済み |
| `005_qr_invitation.sql` | QRコード招待フロー対応 | ✅ 実施済み |
| `006_delivery_blackouts.sql` | 発注イレギュラー管理再設計 | ⏳ 手動実行が必要 |
| `007_prep_logs.sql` | 仕込み完了ログテーブル | ⏳ 手動実行が必要 |
| `cleanup_test_users.sql` | テストユーザー削除 | ⏳ 手動実行が必要 |

---

## 環境変数

### フロントエンド（`frontend/.env.local`）
```
VITE_SUPABASE_URL=https://mmquefvklrxjcmoxgvjb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### GitHub Actions Secrets（CI/CD 用）
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## Supabase 設定状況

| 設定 | 値 |
|------|-----|
| Site URL | `https://masudabizzz-create.github.io/yakitori-app-v2` |
| Redirect URLs | 同上 + `http://localhost:5173` |
| Confirm email | **OFF**（メール確認なし） |
| SMTP | 未設定（Resend 等への切り替えを推奨） |

---

## 既知の制約・今後の対応

| 項目 | 状況 |
|------|------|
| カスタム SMTP | 未設定。Resend（無料 3,000通/月）への切り替えを推奨 |
| LINE Vault 暗号化 | 未実装。LINE トークンは settings テーブルに平文保存 |
| テストユーザー削除 | `cleanup_test_users.sql` を SQL Editor で実行する |
| 006 マイグレーション | `006_delivery_blackouts.sql` を SQL Editor で実行する（旧テーブル廃止・新テーブル作成） |
| `007_prep_logs.sql` を SQL Editor で実行する（仕込み完了ログテーブル作成） |

---

## よく使うコマンド

```bash
# ローカル開発
cd frontend && npm run dev

# テスト
cd frontend && npm run test

# 型チェック
cd frontend && npm run typecheck

# Edge Function デプロイ
supabase functions deploy manage-users
supabase functions deploy send-line

# GitHub Pages デプロイ（main push で自動）
git push origin main
```
