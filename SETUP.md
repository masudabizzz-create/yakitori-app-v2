# 串在庫管理アプリ v2 — セットアップ手順

GAS + Spreadsheet 構成から Vue 3 + Supabase 構成へ刷新したアプリです。
本書は **Phase 1（基盤構築）** までの成果物に対するセットアップ手順です。

---

## ディレクトリ構成

```
yakitori-app-v2/
├── SETUP.md                  ← 本書
├── frontend/                 ← Vue 3 + Vite フロントエンド
│   ├── src/
│   │   ├── lib/supabase.ts   ← Supabase クライアント
│   │   ├── stores/auth.ts    ← 認証ストア（Supabase Auth）
│   │   ├── router/index.ts   ← ルート定義・認証ガード
│   │   ├── views/            ← 画面（Login/Home は実装済み、他は Phase 2/3）
│   │   ├── composables/      ← （Phase 2 で実装）
│   │   └── components/       ← （Phase 2/3 で実装）
│   └── tests/                ← （Phase 2 で実装）
├── supabase/
│   └── migrations/           ← DB スキーマ・RLS・初期データ SQL
└── scripts/
    ├── gas_export.js         ← GAS 側エクスポート
    └── migrate_from_gas.ts   ← Supabase へのインポート
```

---

## 前提

- Node.js 20 以上 / npm
- Supabase アカウント（無料枠で可）

---

## 1. Supabase プロジェクトのセットアップ

### 1-1. プロジェクト作成

1. [supabase.com](https://supabase.com) でログインし、新規プロジェクトを作成する
2. 作成後、以下を控える（`Settings > API`）
   - **Project URL** … `https://xxxx.supabase.co`
   - **anon public key** … フロントエンド用
   - **service_role key** … データ移行スクリプト用（秘密厳守）

### 1-2. テーブル・RLS の作成

Supabase Dashboard の **SQL Editor** で、以下を**この順番で**実行する。

| 順 | ファイル | 内容 |
|----|---------|------|
| 1 | `supabase/migrations/001_initial_schema.sql` | 全7テーブル + インデックス |
| 2 | `supabase/migrations/002_rls_policies.sql` | RLS（テナント分離 + ロール制御） |
| 3 | `supabase/migrations/003_seed_data.sql` | デフォルトテナント・設定 |

### 1-3. 管理者ユーザーの作成

1. **Authentication > Users** で新規ユーザー（メール/パスワード）を作成する
2. 作成されたユーザーの UUID を控える
3. **SQL Editor** で以下を実行する（UUID を差し替え）

```sql
INSERT INTO public.users (id, tenant_id, name, role, is_active)
VALUES (
  '<作成したユーザーのUUID>',
  '00000000-0000-0000-0000-000000000001',
  '管理者',
  'admin',
  true
);
```

### 1-4. スタッフの追加

アプリの「システム管理 > スタッフ管理」画面では、既存スタッフの
名前・役割・有効フラグの**編集のみ**可能です（Supabase Auth ユーザーの
作成にはサーバー権限が必要なため）。新規スタッフの追加は 1-3 と同じ手順で行います。

1. **Authentication > Users** でメール/パスワードを作成する
2. **SQL Editor** で `public.users` に INSERT する
   （`role` は `manager` または `user`、`tenant_id` は同じ値）

退職者はスタッフ管理画面で「有効」をオフにしてください
（完全な追加・削除UIは Phase 4 で Edge Function により対応予定）。

---

## 2. フロントエンドの起動

```bash
cd frontend
npm install

# 環境変数を設定
cp .env.example .env.local
# .env.local を編集し、1-1 で控えた値を設定する:
#   VITE_SUPABASE_URL=https://xxxx.supabase.co
#   VITE_SUPABASE_ANON_KEY=eyJ...

npm run dev
```

ブラウザで表示される URL（既定 `http://localhost:5173`）を開き、
1-3 で作成した管理者アカウントでログインできれば Phase 1 の確認は完了。

### その他のコマンド

```bash
npm run build      # 本番ビルド（型チェック込み）
npm run typecheck  # 型チェックのみ
npm run test       # Vitest（テストは Phase 2 で追加）
```

---

## 3. 既存データの移行（任意）

既存 GAS のデータを Supabase へ移行する場合のみ実施する。

### 3-1. GAS からエクスポート

1. 既存 GAS プロジェクト（`コード.gs` と同じプロジェクト）に
   `scripts/gas_export.js` の内容を貼り付ける
2. `exportToJson()` を実行する
3. Google Drive に生成された `gas_export.json` をダウンロードし、
   `scripts/` ディレクトリに置く

### 3-2. Supabase へインポート

```bash
cd scripts
npm install

SUPABASE_URL='https://xxxx.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<service_role key>' \
npx tsx migrate_from_gas.ts
```

> `service_role key` は RLS をバイパスするため、取り扱いに注意すること。
> LINE トークンはセキュリティ上エクスポートされないため、移行後に
> システム管理画面（Phase 3）から再設定する。

---

## 4. LINE通知 Edge Function のデプロイ

ブラウザから LINE Messaging API を直接叩くと **CORS でブロック**されるため、
中継用の Supabase Edge Function（`supabase/functions/send-line/`）を経由します。
LINE トークンはサーバー側（Edge Function 内で `settings` テーブルから取得）に
閉じ込められ、フロントエンドには露出しません。

### 4-1. Supabase CLI のインストール

```bash
brew install supabase/tap/supabase
# または: npm install -g supabase
```

### 4-2. プロジェクトリンク

リポジトリのルート（`yakitori-app-v2/`）で：

```bash
cd /Users/masudayui/yakitori-app-v2

# 初回のみ（supabase/config.toml が無い場合）
supabase init     # 既存ファイルは上書きされない

supabase login              # ブラウザでログイン
supabase link --project-ref mmquefvklrxjcmoxgvjb
```

### 4-3. デプロイ

```bash
supabase functions deploy send-line
```

成功すると `https://mmquefvklrxjcmoxgvjb.supabase.co/functions/v1/send-line` で公開されます。

### 4-4. 動作確認

1. アプリ（システム管理 > システム設定）で LINE トークンを設定済みであること
2. 営業後入力から送信 → LINE で通知が届けば成功
3. 失敗時はブラウザ DevTools の Network で `/functions/v1/send-line` のレスポンスを確認

### 4-5. ローカル開発で試したい場合（任意）

```bash
supabase start                     # ローカル Supabase スタックを起動
supabase functions serve send-line # 関数をローカルで実行
```

> ※ ローカルの Supabase は別 DB なので、本番設定確認には**デプロイ版を使うのが簡単**です。

---

## 5. デプロイ（GitHub Pages）

`.github/workflows/ci.yml` が main への push 時に
**テスト → 本番ビルド → GitHub Pages デプロイ**を自動実行する。

事前準備（GitHubリポジトリ側）:

1. リポジトリ名を `yakitori-app-v2` にする
   （`frontend/vite.config.ts` の `base` と一致させる。別名なら `base` を変更）
2. **Settings > Pages** で Source を「GitHub Actions」に設定
3. **Settings > Secrets and variables > Actions** に以下のシークレットを登録:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

main に push すると自動でデプロイされ、
`https://<ユーザー名>.github.io/yakitori-app-v2/` で公開される。
Pull Request ではテスト・ビルドのみ実行される。

手動でビルドを確認する場合:

```bash
cd frontend
GITHUB_PAGES=1 npm run build   # dist/ に出力
npm run preview
```

---

## 6. v1（GAS版）からの切り替え

1. 3章の手順で既存データを Supabase へ移行する
2. v2 を GitHub Pages に公開し、一定期間 GAS版と**並行運用**する
   - 営業後入力・LINE通知・発注推定の結果が GAS版と一致することを確認
3. 問題がなければ v2 に一本化し、GAS版の入力フォーム・トリガーを停止する

---

## 実装状況

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 1 | 基盤構築（Supabase・Vite・認証・移行スクリプト） | ✅ 完了 |
| Phase 2 | 計算ロジック移植・Vitestテスト・営業後入力・LINE通知 | ✅ 完了 |
| Phase 3 | 各画面実装（ダッシュボード/分析/発注/運用管理/システム管理） | ✅ 完了 |
| Phase 4 | CI/CD・デプロイ設定・README | ✅ 完了 |

全画面が実装済み。ユニットテストは `npm run test` で実行できる。

### 既知の制約

- スタッフの新規追加・削除は Supabase Dashboard で実施（1-4 参照）
- LINEトークンは RLS と Edge Function 経由で保護（Vault暗号化は今後の強化項目）
