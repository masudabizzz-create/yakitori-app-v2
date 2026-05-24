# 串在庫管理アプリ v2

焼き鳥店向けの串在庫・仕込み・発注管理アプリ。
GAS + Spreadsheet 構成（v1）から **Vue 3 + Supabase** 構成へ全面刷新したもの。

複数店舗展開を前提に全テーブルへ `tenant_id` を持たせ、現在は1店舗で運用する。

---

## 技術スタック

| 領域 | 採用技術 |
|------|---------|
| フレームワーク | Vue 3（Composition API） |
| ビルド | Vite |
| スタイル | Tailwind CSS v3 |
| 状態管理 | Pinia |
| ルーティング | Vue Router 4 |
| テスト | Vitest |
| DB / 認証 | Supabase（PostgreSQL + Auth、RLS） |
| 祝日判定 | japanese-holidays |
| ホスティング | GitHub Pages |
| CI/CD | GitHub Actions |
| 通知 | LINE Messaging API |

---

## ディレクトリ構成

```
yakitori-app-v2/
├── README.md                 ← 本書
├── SETUP.md                  ← セットアップ手順（Supabase・起動・移行）
├── .github/workflows/ci.yml  ← CI/CD（テスト・ビルド・Pagesデプロイ）
├── frontend/                 ← Vue 3 + Vite フロントエンド
│   ├── src/
│   │   ├── lib/supabase.ts        Supabase クライアント
│   │   ├── router/index.ts        ルート定義・認証ガード
│   │   ├── stores/                Pinia ストア（auth/skewers/dailyLog/settings/orderSchedule/users）
│   │   ├── composables/           計算ロジック（useInventoryCalc/useLineNotify/useHolidays/useAnalytics）
│   │   ├── views/                 画面（Login/Home/Input/Dashboard/Analytics/Order/OpsAdmin/SysAdmin）
│   │   └── components/            UI部品（ops/ sys/ 配下にタブ部品）
│   └── tests/unit/                Vitest ユニットテスト
├── supabase/migrations/      ← DBスキーマ・RLS・初期データ SQL
└── scripts/                  ← GAS → Supabase データ移行スクリプト
```

---

## 画面一覧

| 画面 | URL | 認証 |
|------|-----|------|
| ログイン | `/login` | — |
| ホーム | `/` | ログイン必須 |
| 営業後入力 | `/input` | user 以上 |
| 仕込みダッシュボード | `/dashboard` | user 以上 |
| 分析・集計 | `/analytics` | user 以上 |
| 発注推定 | `/order` | user 以上 |
| 運用管理 | `/admin/ops` | manager 以上 |
| システム管理 | `/admin/sys` | admin のみ |

ロール（admin / manager / user）は Supabase の `users` テーブルで管理し、
Row Level Security（RLS）でサーバー側でも強制される。

---

## セットアップ

詳細は **[SETUP.md](./SETUP.md)** を参照。要約:

1. Supabase プロジェクトを作成し、`supabase/migrations/` の SQL を 001 → 002 → 003 の順で適用
2. `frontend/.env.local` に `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を設定
3. 管理者ユーザーを作成（SETUP.md 1-3）

```bash
cd frontend
npm install
npm run dev
```

---

## 開発コマンド

```bash
cd frontend
npm run dev          # 開発サーバー
npm run test         # Vitest（ユニットテスト）
npm run test:watch   # Vitest ウォッチモード
npm run test:coverage# カバレッジ計測
npm run typecheck    # vue-tsc 型チェック
npm run build        # 本番ビルド（型チェック込み）
npm run preview      # ビルド結果のプレビュー
```

### テスト

計算ロジック（仕込み計算・発注推定・LINE文面・集計）は GAS 版から忠実移植し、
ユニットテストで検証している。

```
useInventoryCalc  仕込み計算・発注推定・LINE文面・コース内訳
useLineNotify     LINE通知送信
useHolidays       祝日判定
useAnalytics      売上集計・トレンド・曜日別平均
stores/dailyLog   営業後入力ペイロード生成・下書き
```

---

## デプロイ（GitHub Pages）

`.github/workflows/ci.yml` が main への push 時に
テスト → ビルド → GitHub Pages デプロイを自動実行する。

事前準備:

1. リポジトリ名を `yakitori-app-v2` にする（`vite.config.ts` の `base` と一致させる。
   別名にする場合は `base` を変更）
2. **Settings > Pages** で Source を「GitHub Actions」に設定
3. **Settings > Secrets and variables > Actions** に以下を登録:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

PR では テスト・ビルドのみ実行され、デプロイは行われない。

---

## v1（GAS版）からの移行と切り替え

1. **データ移行**: `scripts/` の手順で既存 Spreadsheet を Supabase へ移行（SETUP.md 3章）
2. **並行運用**: v2 を GitHub Pages に公開し、一定期間 GAS版と並行運用。
   営業後入力・LINE通知・発注推定の結果が一致することを確認する
3. **切り替え**: 問題がなければ v2 に一本化。GAS版の入力フォーム/トリガーを停止する

---

## 既知の制約・今後の課題

| 項目 | 状況 |
|------|------|
| LINE通知の送信経路 | 現状はブラウザから直接 fetch（CORS制約あり）。本番は Supabase Edge Function プロキシ経由が必要。`sendLineBroadcast` の `endpoint` 引数で差し替え可能 |
| スタッフの新規追加・削除 | Supabase Auth ユーザー作成にサーバー権限が必要なため、現状は Dashboard で実施。完全なCRUDは Edge Function で対応予定（SETUP.md 1-4） |
| LINEトークンの暗号化 | 現状は `settings` テーブルに保存し RLS（admin限定）で保護。Supabase Vault による暗号化は今後の強化項目 |

---

## ライセンス

社内利用。
