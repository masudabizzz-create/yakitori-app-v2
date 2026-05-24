# 串在庫管理アプリ v2 — アップグレード仕様書

> 作成日: 2026-05-22  
> 目的: GAS + Spreadsheet 構成から Vue 3 + Supabase 構成へ全面刷新。複数店舗展開を前提に、1店舗から運用開始する。

---

## 0. 既存資産の引き継ぎ方針

| 項目 | 方針 |
|------|------|
| 画面構成・機能 | ほぼ全て継承。UI を刷新する |
| 計算ロジック | `calcPrep` / `calculateOrderEstimate` を TypeScript に移植 |
| LINE通知フォーマット | `buildLineMessage` のフォーマットを完全継承 |
| データ構造 | Supabase（PostgreSQL）に再設計。列名・型を整理 |
| 認証 | パスワード平文照合 → Supabase Auth に刷新 |
| Google Forms 連携 | 廃止。アプリ内入力に一本化 |
| `prep_calc` シート | 未使用のため廃止 |

---

## 1. アーキテクチャ

```
GitHub Pages（無料）           Supabase（無料枠）
┌───────────────────┐          ┌──────────────────────────┐
│  Vue 3 Frontend   │ ─API──▶  │  Supabase                │
│  + Tailwind CSS   │          │  ├── PostgreSQL（DB）     │
│  + Pinia          │ ◀─JSON─  │  ├── Auth（認証）         │
│  + Vue Router 4   │          │  ├── Edge Functions（任意）│
│  + Vitest         │          │  └── Realtime（将来用）   │
└───────────────────┘          └──────────────────────────┘
        ↑                                    │
  GitHub Actions                      LINE Messaging API
  自動テスト・デプロイ                  ブロードキャスト通知
```

---

## 2. 技術スタック

| 項目 | 採用技術 | 既存との変化 |
|------|---------|------------|
| フレームワーク | Vue 3 (Composition API) | GAS HTML → Vue 3 |
| ビルド | Vite | 新規 |
| スタイル | Tailwind CSS v3 | 古いHTML → Tailwind |
| 状態管理 | Pinia | 新規 |
| ルーティング | Vue Router 4 | `?page=xxx` → `/xxx` |
| テスト | Vitest + Vue Test Utils | 新規 |
| DB | Supabase（PostgreSQL） | Google Sheets → Supabase |
| 認証 | Supabase Auth | パスワード平文 → JWT |
| ホスティング | GitHub Pages | GAS WebApp → GitHub Pages |
| 通知 | LINE Messaging API | 継続 |
| CI/CD | GitHub Actions | 新規 |

---

## 3. マルチテナント設計

全テーブルに `tenant_id` を持たせる。今は1店舗（`tenant_id = 1`固定）で動かし、2店舗目からは値を増やすだけで対応できる。

```sql
-- 全テーブル共通の考え方
CREATE TABLE skewers (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  ...
);

-- Row Level Security（RLS）で自テナントのデータのみアクセス可
ALTER TABLE skewers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant isolation" ON skewers
  USING (tenant_id = auth.jwt() ->> 'tenant_id');
```

---

## 4. データベース設計（Supabase / PostgreSQL）

### `tenants`（店舗）
| カラム | 型 | 内容 |
|--------|-----|------|
| id | uuid PK | 店舗ID |
| name | text | 店舗名 |
| created_at | timestamptz | 作成日時 |

---

### `users`（スタッフ）
| カラム | 型 | 内容 | 既存との変化 |
|--------|-----|------|------------|
| id | uuid PK | Supabase Auth の user_id | 新規 |
| tenant_id | uuid FK | 所属店舗 | 新規 |
| name | text | スタッフ名 | 継承 |
| role | text | admin / manager / user | 継承 |
| is_active | boolean | 有効フラグ | 継承（`TRUE/FALSE` → boolean） |
| created_at | timestamptz | 作成日時 | 新規 |

---

### `skewers`（串マスタ）
既存の `skewers` シート22列を忠実に再現する。

| カラム | 型 | 内容 | 既存との対応 |
|--------|-----|------|------------|
| id | uuid PK | 串ID | 新規（indexの代替） |
| tenant_id | uuid FK | 所属店舗 | 新規 |
| name | text | 串名 | 列A |
| category | text | レギュラー / スペシャル / つくね / 前日仕込み / その他仕込み / 副産物 | 列B |
| ideal_mon〜ideal_sun | integer | 曜日別理想在庫 | 列C〜I |
| unit | integer | 1パック/袋あたりの本数 | 列J |
| threshold1 | integer | 閾値1 | 列K |
| prep_amount1 | integer | 仕込量1 | 列L |
| threshold2 | integer | 閾値2 | 列M |
| prep_amount2 | integer | 仕込量2 | 列N |
| is_active | boolean | 有効フラグ | 列O |
| prep_method_name | text | 前日仕込み方法名（例: 昆布締め） | 列P |
| course_type | text | all_courses / specific_courses | 列Q |
| target_courses | text[] | 対象コース配列 | 列R（カンマ区切り → 配列） |
| weight_per_stick_g | numeric | 1本あたり重量g | 列S |
| yield_rate | numeric | 歩留まり率（0〜1） | 列T |
| order_unit_label | text | 発注単位ラベル | 列U |
| order_unit_g | numeric | 1発注単位あたりg | 列V |
| sort_order | integer | 表示順 | 新規 |
| created_at | timestamptz | 作成日時 | 新規 |

---

### `daily_logs`（日次営業ログ）
既存の `daily_log` シートを再現する。

| カラム | 型 | 内容 | 既存との対応 |
|--------|-----|------|------------|
| id | uuid PK | ログID | 新規 |
| tenant_id | uuid FK | 所属店舗 | 新規 |
| log_date | date | 日付 | 列A |
| day_of_week | text | 曜日 | 列B |
| staff_name | text | スタッフ名 | 列C |
| recorded_at | timestamptz | 入力時刻 | 列D |
| course_casual | integer | カジュアルコース組数 | 列E |
| course_standard | integer | スタンダードコース組数 | 列F |
| course_premium | integer | プレミアムコース組数 | 列G |
| extra_skewers | integer | 追加串（本） | 列H |
| total_skewers | integer | 合計串（本） | 列I |
| total_sales | integer | 総売上（円） | 列J |
| drink_sales | integer | ドリンク売上（円） | 列K |
| drink_ratio | numeric | ドリンク比率（%） | 列L |
| memo | text | メモ | 列M末尾の文字列 |
| created_at | timestamptz | 作成日時 | 新規 |

---

### `daily_log_stocks`（日次在庫スナップショット）
既存の `daily_log` 列M〜を正規化して分離。

| カラム | 型 | 内容 |
|--------|-----|------|
| id | uuid PK | |
| daily_log_id | uuid FK | daily_logs への参照 |
| skewer_id | uuid FK | skewers への参照 |
| stock | integer | 在庫本数（その他仕込みは 999=仕込み中 / 0=なし） |
| is_kombu | boolean | 前日仕込み：昆布締め済みフラグ |

---

### `settings`（システム設定）
既存の `settings` シート（KV形式）を引き継ぐ。

| カラム | 型 | 内容 | 既存との対応 |
|--------|-----|------|------------|
| id | uuid PK | | |
| tenant_id | uuid FK | 所属店舗 | 新規 |
| sunday_boost_enabled | boolean | 日曜ブースト | `sunday_boost_enabled` |
| course_casual_price | integer | カジュアル価格 | 継承 |
| course_standard_price | integer | スタンダード価格 | 継承 |
| course_premium_price | integer | プレミアム価格 | 継承 |
| course_casual_skewers | integer | カジュアル串本数 | 継承 |
| course_standard_skewers | integer | スタンダード串本数 | 継承 |
| course_premium_skewers | integer | プレミアム串本数 | 継承 |
| line_token | text | LINEトークン（暗号化保存） | 継承 |
| updated_at | timestamptz | 更新日時 | 新規 |

---

### `order_schedules`（通常発注スケジュール）
| カラム | 型 | 内容 | 既存との対応 |
|--------|-----|------|------------|
| id | uuid PK | | |
| tenant_id | uuid FK | | 新規 |
| deadline_dow | integer | 締め曜日（0=日〜6=土） | 列A |
| delivery_dow | integer | 納品曜日 | 列B |
| uplift_weekday | numeric | 平日上振れ率 | 列C |
| uplift_holiday | numeric | 祝日上振れ率 | 列D |
| sort_order | integer | 並び順 | 新規 |

---

### `order_schedule_irregulars`（例外発注スケジュール）
| カラム | 型 | 内容 | 既存との対応 |
|--------|-----|------|------------|
| id | uuid PK | | |
| tenant_id | uuid FK | | 新規 |
| week_start_date | date | 対象週開始日 | 列A |
| deadline_date | date | 締め日 | 列B |
| delivery_date | date | 納品日 | 列C |
| uplift_weekday | numeric | 平日上振れ率 | 列D |
| uplift_holiday | numeric | 祝日上振れ率 | 列E |
| note | text | 備考 | 列F |

---

## 5. 認証設計

### 方式の変更
| | 既存 | v2 |
|--|------|-----|
| スタッフ選択 | ドロップダウン選択（認証なし） | メール＋パスワード（Supabase Auth） |
| 管理者 | パスワード平文照合 | ロールベース（JWT内のrole） |
| セッション | ページ変数（リロードで消える） | JWTトークン（localStorageに保持） |

### ロール別アクセス制御
| ロール | アクセスできる画面 |
|--------|----------------|
| user | 入力・ダッシュボード・発注推定 |
| manager | user の全て＋運用管理 |
| admin | 全て＋システム管理 |

> **RLSとJWT連携**: Supabase の Row Level Security でサーバー側でもロールを強制する。フロントだけの制御に依存しない。

---

## 6. 画面構成

### ルーティング（`/` ベース）

| 画面 | URL | 認証 | 既存との対応 |
|------|-----|------|------------|
| ホーム | `/` | ログイン必須 | `?page=home` |
| 営業後入力 | `/input` | user以上 | `?page=index` |
| 仕込みダッシュボード | `/dashboard` | user以上 | `?page=home`（新機能として分離） |
| 分析・集計 | `/analytics` | user以上 | `?page=analytics` |
| 発注推定 | `/order` | user以上 | `?page=order` |
| 運用管理 | `/admin/ops` | manager以上 | `?page=ops_admin` |
| システム管理 | `/admin/sys` | adminのみ | `?page=sys_admin` |

---

## 7. 各画面の詳細仕様

### 7-1. 仕込みダッシュボード（`/dashboard`）★新設

**目的**: 「明日何をどれだけ仕込むか」を一目で確認する。毎日仕込み前に必ず見る画面。

**表示内容**
- 本日の営業日・翌日の曜日
- 翌日が日曜の場合「明日は日曜日（休業）」バナー表示
- 串ごとの仕込み推奨量（`calcPrep` の結果をそのまま表示）
  - レギュラー・つくね: `○P` / `○B` 表示
  - スペシャル・その他仕込み: `○本` 表示
  - 前日仕込み: 昆布締め開始 / 串うち（昆布締め済み）/ 昆布締めなし・直接串うち
  - 副産物: 表示しない（既存踏襲）
- 現在在庫数（入力されている最新値）
- カテゴリタブで絞り込み可能

**データの流れ**
```
最新の daily_log_stocks
  ↓
calcPrep（計算ロジック）
  ↓
仕込み推奨量を表示
```

> 既存の `index.html` 送信完了後に表示していた仕込み計算結果を、独立した画面として常時閲覧できる形にする。

---

### 7-2. 営業後入力（`/input`）

既存の `index.html` を踏襲。変更点のみ記載。

**変更点**
- カテゴリ別ステッパー → そのまま継承
- 送信完了後、`/dashboard` へ自動遷移（仕込み量を即確認できる）
- Google Forms 連携ボタン → 廃止
- `localStorage` でのオフライン退避 → 継承

---

### 7-3. 分析・集計（`/analytics`）

既存の `analytics.html` をほぼそのまま継承。

**変更点**
- データ取得元: Spreadsheet → Supabase `daily_logs`
- グラフライブラリ: Chart.js（既存と同じ）

---

### 7-4. 発注推定（`/order`）

既存の `order.html` をほぼそのまま継承。

**変更点**
- 入力値の保存: `localStorage`（キー: `yakitori_guests_v1`） → そのまま継承
- 祝日判定: Google Calendar API → 継承（または `japanese-holidays` npm パッケージ）
- 発注スケジュール取得: GAS → Supabase `order_schedules`

---

### 7-5. 運用管理（`/admin/ops`）

既存の `ops_admin.html` 3タブをそのまま継承。

**変更点**
- 認証方式: パスワード入力 → Supabase Auth（manager以上のみアクセス可）
- 「フォームを更新」ボタン → 廃止（Google Forms連携廃止のため）
- 保存先: Spreadsheet → Supabase

---

### 7-6. システム管理（`/admin/sys`）

既存の `sys_admin.html` を継承。

**変更点**
- 認証方式: パスワード入力 → Supabase Auth（adminのみ）
- スタッフ管理: Supabase Auth のユーザー管理と連動
- パスワード変更: Supabase Auth の機能を利用
- LINE トークン: Supabase の `settings` テーブルに保存（暗号化）

---

## 8. 計算ロジック（完全継承・TypeScriptに移植）

既存の計算式を変更せず、`composables/useInventoryCalc.ts` に移植する。

### 仕込み計算（`calcPrep`）

```typescript
// レギュラー・つくね
function calcPrepRegular(stock: number, ideal: number, unit: number): number {
  const needed = ideal - stock
  if (needed <= 0) return 0
  return Math.ceil(needed / unit) * unit
}

// 日曜ブースト（レギュラーのみ）
function calcSundayBoost(ideal: number, dayOfWeek: number): number {
  const daysUntilSunday = 7 - dayOfWeek
  return ideal + Math.round(ideal * (1 / daysUntilSunday))
}

// スペシャル・その他仕込み（閾値方式）
function calcPrepThreshold(
  stock: number,
  threshold1: number, prepAmount1: number,
  threshold2: number, prepAmount2: number
): number {
  if (stock <= threshold2) return prepAmount2
  if (stock <= threshold1) return prepAmount1
  return 0
}

// 前日仕込み
type KombuAction = 'skewer_kombu' | 'none' | 'kombu' | 'skewer_direct'
function calcKombuAction(
  stock: number, isKombu: boolean,
  ideal: number, threshold2: number
): KombuAction {
  if (isKombu) return 'skewer_kombu'
  if (stock >= ideal) return 'none'
  if (stock > threshold2) return 'kombu'
  return 'skewer_direct'
}
```

### 発注推定計算（`calculateOrderEstimate`）
既存の `calculateOrderEstimate` を完全移植。計算式・丸め方・均等発注量の計算も含めて変更しない。

---

## 9. LINE通知

### 変更点
- 送信タイミング: GAS の `submitDailyReport` → Supabase Edge Function または Vue からの直接 fetch
- 送信先: LINE Messaging API ブロードキャスト（継承）

### メッセージフォーマット（完全継承）
```
🍢 明日の仕込み yyyy/MM/dd(曜)
──────────────
◆ 串名  [仕込み量]  (在庫 XX本/P/B)
  串名  仕込みなし  (在庫 XX本)
──────────────
📊 今日 yyyy/MM/dd(曜)の実績
売上 ¥XX,XXX  ドリンク XX%
C{n}組 / S{n}組 / P{n}組  追加{n}本
合計 {n}本  焼師 {スタッフ名}
──────────────  ← メモあり時のみ
📝 {メモ内容}
```

---

## 10. フロントエンド構成

```
frontend/
├── src/
│   ├── router/
│   │   └── index.ts            ← ルート定義・認証ガード
│   ├── stores/
│   │   ├── auth.ts             ← Supabase Auth 状態
│   │   ├── skewers.ts          ← 串マスタ
│   │   ├── dailyLog.ts         ← 日次ログ・入力フォーム状態
│   │   └── settings.ts         ← システム設定
│   ├── composables/
│   │   ├── useInventoryCalc.ts ← 仕込み計算・発注計算（テスト対象）
│   │   ├── useLineNotify.ts    ← LINE通知送信
│   │   └── useHolidays.ts      ← 祝日判定
│   ├── views/
│   │   ├── HomeView.vue
│   │   ├── InputView.vue       ← 営業後入力
│   │   ├── DashboardView.vue   ← 仕込みダッシュボード★
│   │   ├── AnalyticsView.vue
│   │   ├── OrderView.vue       ← 発注推定
│   │   ├── OpsAdminView.vue    ← 運用管理
│   │   └── SysAdminView.vue    ← システム管理
│   ├── components/
│   │   ├── PrepCard.vue        ← 仕込み推奨カード
│   │   ├── StepperInput.vue    ← 数量ステッパー（スマホ最適化）
│   │   ├── CategoryTabs.vue
│   │   ├── SummaryCard.vue     ← 分析サマリー
│   │   └── ConfirmModal.vue    ← 送信確認モーダル
│   ├── lib/
│   │   └── supabase.ts         ← Supabase クライアント初期化
│   └── types/
│       └── index.ts            ← 型定義（Skewer, DailyLog 等）
├── tests/
│   ├── unit/
│   │   ├── useInventoryCalc.test.ts  ← 計算ロジック（最重要）
│   │   ├── useLineNotify.test.ts
│   │   └── stores/
│   │       └── dailyLog.test.ts
│   └── e2e/                         ← 任意（Playwright）
├── vite.config.ts
├── vitest.config.ts
└── package.json
```

---

## 11. テスト方針

### 必須テスト（Claude Codeが自動生成・実行）

```typescript
// useInventoryCalc.test.ts
describe('仕込み計算 - レギュラー・つくね', () => {
  it('理想在庫を下回るとき仕込み量を単位の倍数で返す')
  it('在庫が理想以上のとき 0 を返す')
  it('日曜ブースト ON・月曜のとき理想在庫にブーストを加算する')
  it('日曜ブースト OFF のとき補正しない')
})

describe('仕込み計算 - スペシャル・その他仕込み（閾値）', () => {
  it('在庫が threshold2 以下のとき prepAmount2 を返す')
  it('在庫が threshold1 以下 threshold2 超のとき prepAmount1 を返す')
  it('在庫が threshold1 超のとき 0 を返す')
})

describe('仕込み計算 - 前日仕込み（昆布締め）', () => {
  it('isKombu=true のとき skewer_kombu を返す')
  it('在庫が理想以上のとき none を返す')
  it('在庫が threshold2 超のとき kombu を返す')
  it('それ以外のとき skewer_direct を返す')
})

describe('発注推定計算', () => {
  it('平日上振れ率を正しく適用する')
  it('祝日上振れ率を正しく適用する')
  it('在庫控除後の発注量を正しく算出する')
  it('複数スケジュール時の均等発注量を正しく算出する')
  it('weightPerStickG=0 のとき発注量を計算しない')
})

describe('LINE メッセージフォーマット', () => {
  it('仕込みありの串を正しくフォーマットする')
  it('仕込みなしの串を正しくフォーマットする')
  it('前日仕込みのアクションを正しく表示する')
  it('メモなし時は区切り線を出力しない')
})
```

### カバレッジ目標
| 対象 | 目標 |
|------|------|
| `useInventoryCalc.ts` | 90%以上 |
| `useLineNotify.ts` | 80%以上 |
| Pinia Stores | 70%以上 |

---

## 12. UI・UXデザイン方針

- **スマホファースト**: iPhone Safari での動作を最優先
- **タップ領域**: 最低 44px（ステッパーボタンは特に大きく）
- **数値入力**: `inputmode="numeric"` でテンキー表示
- **送信確認**: 誤送信防止のため確認モーダルを必ず挟む（既存踏襲）
- **仕込みダッシュボード**: 数字より「何をするか」がひと目で分かる表示
- **色の使い方**: アラートより「今日やること」の整理に使う

---

## 13. 環境変数

```bash
# .env.local（Git に含めない）
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...

# .env.example（Git に含める）
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 14. 実装フェーズ

### Phase 1: 基盤構築
- [ ] Supabase プロジェクト作成・テーブル設計・RLS設定
- [ ] Vue 3 + Vite プロジェクト初期化
- [ ] Supabase Auth 認証フロー実装
- [ ] 既存データの Supabase への移行スクリプト作成

### Phase 2: コア機能移植
- [ ] `useInventoryCalc.ts` に計算ロジック移植
- [ ] Vitest テスト全件作成・通過確認
- [ ] 営業後入力画面（`/input`）
- [ ] LINE通知（既存フォーマット継承）

### Phase 3: 画面実装
- [ ] 仕込みダッシュボード（`/dashboard`）★
- [ ] 分析・集計（`/analytics`）
- [ ] 発注推定（`/order`）
- [ ] 運用管理（`/admin/ops`）
- [ ] システム管理（`/admin/sys`）

### Phase 4: 仕上げ・デプロイ
- [ ] GitHub Actions CI/CD 設定
- [ ] GitHub Pages デプロイ
- [ ] 既存GASとの並行運用・切り替えテスト
- [ ] README 作成

---

## 15. 将来の拡張予定（今回は実装しない）

| 機能 | 時期の目安 | 前提条件 |
|------|-----------|---------|
| 曜日・季節補正（傾向学習） | 半年〜1年後 | 日次データ6ヶ月以上 |
| AI発注量提案 | 1〜2年後 | 日次データ1年以上＋廃棄数・売り切れデータ |
| 複数店舗管理UI | 2店舗目ができたとき | tenant_id は最初から設計済み |
| 予約データ連携 | 任意 | 予約システムのAPI |

---

## 16. 廃止する機能

| 機能 | 廃止理由 |
|------|---------|
| Google Forms 連携（`createOrUpdateGoogleForm`） | アプリ内入力に一本化するため |
| `prep_calc` シート | 現在未使用のため |
| `admin.html`（旧管理画面） | `sys_admin.html` に統合済みのため |
| ヒーローイメージ（Google Drive参照） | UIを刷新するため（任意で復活可） |
| `sessionStorage` によるリダイレクト | Vue Router の認証ガードで代替 |
