# 串在庫管理アプリ v2 — AI向けプロジェクトサマリー

> このドキュメントは別のAIアシスタントに渡して全体像を理解させるための自己完結した仕様サマリーです。  
> 最終更新: 2026-06-02

---

## 1. システム概要

**アプリ名**: 串在庫管理アプリ v2  
**対象業態**: 焼き鳥店（複数店舗展開を前提）  
**本番URL**: https://masudabizzz-create.github.io/yakitori-app-v2/  
**GitHubリポジトリ**: https://github.com/masudabizzz-create/yakitori-app-v2

### 解決する課題

焼き鳥店の日次営業後に行う作業を一元管理する：

1. **串在庫の入力** — 各種串（レギュラー・スペシャル・つくね等）の残り在庫を入力
2. **翌日仕込み量の自動計算** — 理想在庫との差分から「何パック仕込むか」を計算
3. **LINE通知** — 営業後入力完了時にスタッフのLINEへ仕込み指示を自動送信
4. **発注推定** — 曜日別来客データと発注スケジュールから仕入れ量を算出
5. **売上分析** — 期間別・曜日別の売上・ドリンク比率・コース内訳を可視化

### 開発経緯

旧システムは Google Apps Script + スプレッドシート（v1）で構築されていた。複数店舗展開を見越して Vue 3 + Supabase（v2）へ全面刷新。計算ロジック・LINE通知フォーマットは v1 から忠実移植。

---

## 2. 技術スタック

| レイヤー | 技術 | 備考 |
|--------|------|------|
| フレームワーク | Vue 3 (Composition API) | `<script setup>` スタイル |
| ビルド | Vite | `base: '/yakitori-app-v2/'` |
| スタイル | Tailwind CSS v3 | CSS変数でテナント別テーマカラーを制御 |
| 状態管理 | Pinia | ストアは `frontend/src/stores/` 配下 |
| ルーティング | Vue Router 4 | **hashモード**（`createWebHashHistory`）GitHub Pages対応 |
| テスト | Vitest + Vue Test Utils | 84テスト、計算ロジック中心 |
| バックエンド | Supabase (PostgreSQL + Auth + RLS + Edge Functions) | |
| 祝日判定 | `japanese-holidays` npm パッケージ | |
| ホスティング | GitHub Pages | |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`) | main push で自動テスト・ビルド・デプロイ |
| 通知 | LINE Messaging API (Broadcast) | Edge Function `send-line` 経由 |

### Supabaseプロジェクト

| 環境 | Project Ref | URL |
|------|------------|-----|
| 本番 | `mmquefvklrxjcmoxgvjb` | `https://mmquefvklrxjcmoxgvjb.supabase.co` |
| テスト（ローカル開発用） | `btisymjzessywsceieru` | `https://btisymjzessywsceieru.supabase.co` |

ローカル開発は `.env.local` でテストDBを向く。本番ビルドは GitHub Secrets の環境変数を使用。

---

## 3. データモデル

### テーブル一覧

| テーブル名 | 定義マイグレーション | 役割 |
|----------|----------------|------|
| `tenants` | 001 | 店舗マスタ |
| `users` | 001 | スタッフ（Supabase Auth と連動） |
| `skewers` | 001 | 串マスタ（仕込み計算パラメータ含む） |
| `daily_logs` | 001 | 日次営業ログ（売上・コース組数） |
| `daily_log_stocks` | 001 | 日次在庫スナップショット（串ごと） |
| `settings` | 001 | 店舗ごとのシステム設定 |
| `order_schedules` | 001 | 通常発注スケジュール（曜日ベース） |
| `order_schedule_irregulars` | 001 | 例外発注スケジュール（旧、廃止傾向） |
| `user_invitations` | 004 | QRコード招待トークン管理 |
| `delivery_blackout_periods` | 006 | 配送不可期間 |
| `delivery_irregular_dates` | 006 | 例外納品日 |
| `prep_logs` | 007 | 仕込み完了ログ（記録用途、UI未完） |
| `user_tenant_permissions` | 011 | manager のマルチテナントアクセス権 |
| `audit_logs` | 014 | 操作監査ログ |
| `active_tenant_sessions` | 017 | 訪問中テナントID（platform_admin/manager の店舗切り替え用） |

### 主要テーブルの詳細

#### `tenants`
```
id uuid PK | name text | primary_color text | created_at
```
- `primary_color`: `#FF6B35` 形式の16進数カラーコード。UIのブランドカラーに使用

#### `users`
```
id uuid PK (= auth.users.id) | tenant_id uuid FK | name text
role text | is_active boolean | created_at
```
- `role` は `platform_admin / manager / store_owner / staff_both / staff_kitchen / staff_hall` の6種

#### `skewers`
```
id uuid PK | tenant_id uuid FK | name text | category text
ideal_mon〜ideal_sun integer（曜日別理想在庫本数）
unit integer（1パック/袋あたりの本数）
threshold1/2 integer、prep_amount1/2 integer（スペシャル等の仕込み閾値）
is_active boolean | prep_method_name text
course_type text（all_courses / specific_courses）
target_courses text[]（specific_courses時に対象コースを配列で保持）
weight_per_stick_g numeric | yield_rate numeric（発注計算用）
order_unit_label text | order_unit_g numeric
sort_order integer
```
- `category`: `レギュラー / スペシャル / つくね / 前日仕込み / その他仕込み / 副産物`

#### `daily_logs`
```
id uuid PK | tenant_id uuid FK | log_date date（UNIQUE with tenant_id）
day_of_week text | staff_name text | recorded_at timestamptz
course_casual/standard/premium integer | extra_skewers integer
total_skewers integer | total_sales integer | drink_sales integer
drink_ratio numeric | memo text
```

#### `daily_log_stocks`
```
id uuid PK | daily_log_id uuid FK | skewer_id uuid FK
stock integer（その他仕込み: 999=仕込み中, 0=なし）
is_kombu boolean（前日仕込み: 昆布締め済みフラグ）
```

#### `settings`
```
id uuid PK | tenant_id uuid FK UNIQUE
sunday_boost_enabled boolean
course_casual/standard/premium_price integer
course_casual/standard/premium_skewers integer
line_token text | monthly_sales_target integer（0=未設定）
updated_at timestamptz
```

#### `user_invitations`
```
id uuid PK | tenant_id uuid FK | email text | name text | role text
status text（pending/approved/rejected/used）
created_by uuid | reviewed_by uuid | reviewed_at timestamptz
token text（QRコード用UUID）| expires_at timestamptz
```

#### `active_tenant_sessions`
```
user_id uuid PK（= auth.users.id）| tenant_id uuid FK | updated_at
```
- platform_admin / manager が別店舗に入店したときだけ行が存在する
- `current_tenant_id()` PostgreSQL関数がこのテーブルを優先参照し、なければ `users.tenant_id` にフォールバック

#### `user_tenant_permissions`
```
user_id uuid PK | tenant_id uuid PK | created_at
```
- manager が複数店舗にアクセスできる場合に登録する

#### `audit_logs`
```
id uuid PK | tenant_id uuid | user_id uuid | actor_name text
action text | target_type text | target_id uuid | target_name text
before_value jsonb | after_value jsonb | created_at
```

### RLSポリシー方針

- **テナント分離**: 全テーブルに `tenant_id = current_tenant_id()` 条件を設定
- **`current_tenant_id()` 関数**: `active_tenant_sessions` を優先参照し、なければ `users.tenant_id` を返す（migration 017）
- **`current_user_role()` 関数**: `users.role` を返す
- **platform_admin 例外**: `tenants` テーブルの SELECT は全件許可（店舗選択画面に必要）
- **users テーブル**: 自分自身のレコードは常に SELECT 可（migration 016: `OR id = auth.uid()`）
- **platform_admin の自己更新**: `users_update_self_platform_admin` ポリシー（migration 020）で、他テナント訪問中でも自分のレコードを更新可能

---

## 4. マルチテナント設計

### テナント分離の仕組み

```
リクエスト（JWT付き）
  └─ current_tenant_id()
       ├─ active_tenant_sessions に行あり → そのテナントID
       └─ なし → users.tenant_id（ホームテナント）
            └─ 全テーブルの RLS USING 句と照合
```

- スタッフ（store_owner以下）: 自テナントのみアクセス。`active_tenant_sessions` に行が作られることはない
- manager: `user_tenant_permissions` に登録された複数テナントにアクセス可。訪問中は `enter-tenant` Edge Function で `active_tenant_sessions` を更新
- platform_admin: 全テナントにアクセス可（RLS ポリシーで `platform_admin` ロールを全件許可）

### テナント切り替え（`enterTenant()` in `auth.ts`）

1. `supabase.functions.invoke('enter-tenant', { body: { tenant_id } })` を呼ぶ
2. Edge Function が `active_tenant_sessions` を upsert
3. `current_tenant_id()` が即座に新テナントIDを返すようになる（JWT再発行不要）
4. フロントの `activeTenantId` と `localStorage['yakitori_active_tenant_id']` も更新

### ログイン後フロー

| 条件 | 動作 |
|------|------|
| アクセス可能テナント = 1 | 自動入店（選択画面なし） |
| アクセス可能テナント > 1 | **毎ログイン時**に `/select-tenant` を表示（前回選択を「前回」バッジで表示） |

フレッシュログイン（`supabase.auth.signInWithPassword` 呼び出し時）のみ `_isFreshLogin` フラグで判定。ページリロード（`INITIAL_SESSION`）は前回選択を復元する。

---

## 5. ロール権限

### ロール一覧とランク

```typescript
// frontend/src/lib/roleRank.ts
ROLE_RANK = {
  platform_admin: 5,  // 全店舗横断管理
  manager:        4,  // 複数店舗担当
  store_owner:    3,  // 自店舗責任者
  staff_both:     1,  // スタッフ兼務（キッチン・ホール両方）
  staff_kitchen:  1,  // スタッフ（キッチン・串在庫入力）
  staff_hall:     1,  // スタッフ（ホール・日報入力）
}
```

### 画面アクセス権限マトリクス

| 画面 | staff_* | store_owner | manager | platform_admin |
|------|:-------:|:-----------:|:-------:|:--------------:|
| ログイン・登録 | — | — | — | — |
| ホーム | ✅ | ✅ | ✅ | ✅ |
| 営業後入力 (`/input`) | ✅ | ✅ | ✅ | ✅ |
| 仕込みダッシュボード (`/dashboard`) | ✅ | ✅ | ✅ | ✅ |
| 分析・集計 (`/analytics`) | ❌ | ✅ | ✅ | ✅ |
| 発注推定 (`/order`) | ❌ | ✅ | ✅ | ✅ |
| 運用管理 (`/admin/ops`) | ❌ | ✅ | ✅ | ✅ |
| システム管理 (`/admin/sys`) | ❌ | ✅ | ✅ | ✅ |
| 店舗切り替え | ❌ | ❌ | ✅（許可店舗） | ✅（全店舗） |
| 複数店舗比較 | ❌ | ❌ | ❌ | ✅ |

### その他の権限ルール

- **スタッフ編集**: `ROLE_RANK` が自分より低いユーザーのみ操作可（`canEdit(u)` 関数）
- **QR発行**: 自分より下位ロールのQRのみ発行可（フロント: `assignableRoles` / サーバー: `ROLE_RANK` チェック in `manage-users` Edge Function）
- **拠点店舗変更**: platform_admin のみ（システム管理 → システム設定タブ）

### ルーターガード（`router/index.ts`）

```typescript
// 認証 → is_active チェック → テナント選択 → ロールチェックの順に評価
router.beforeEach(async (to) => {
  if (to.meta.allowedRoles && !to.meta.allowedRoles.includes(auth.role)) {
    return { name: 'home' }  // 権限なし → ホームにリダイレクト
  }
})
```

---

## 6. 主要機能一覧

### 営業後入力（`InputView.vue`）
- 串在庫をカテゴリ別に入力（ステッパーUI）
- コース組数・追加串・総売上・ドリンク比率・メモを入力
- `buildSubmitPayload()` in `dailyLog.ts` で保存ペイロード構築
- `submitDailyReport()` で `daily_logs` upsert + `daily_log_stocks` 洗い替え
- 完了後、LINE通知送信（`useLineNotify.ts` → `send-line` Edge Function）
- `localStorage` に下書き保存（`saveDraft` / `loadDraft`）
- 関連仕様: `current-spec.md` §1 営業後入力

### 仕込みダッシュボード（`DashboardView.vue`）
- 最新の `daily_log` と `daily_log_stocks` を取得（`fetchLatest()` in `dailyLog.ts`）
- `calcPrep()` in `useInventoryCalc.ts` で翌日仕込み量を計算
- 結果を `PrepCard.vue` で表示（仕込みあり/なし/仕込み中）
- 関連仕様: `current-spec.md` §3 仕込み計算

### 分析・集計（`AnalyticsView.vue`）
- 集計期間: 7/14/30/90日
- 前期比較（`calcPeriodComparison()` in `useAnalytics.ts`）
- 月次目標達成率プログレスバー（`settings.monthly_sales_target`）
- 客数・客単価（`calcCustomerMetrics()`）
- 異常値検出 ±1.5σ（`detectAnomalies()`）
- 串ランキング（在庫切れ頻度順、`fetchSkewerStocks()` in `dailyLog.ts`）
- AI向けJSON出力（`getAnalyticsSummary()`、`defineExpose`で外部公開）
- アクセス制限: `store_owner` 以上のみ（ルーター + ホーム画面カード）
- 関連仕様: `analytics-and-env-split.md` パートB

### 発注推定（`OrderView.vue`）
- 過去の曜日別来客数を入力（`localStorage['yakitori_guests_v1']` に保存）
- `calculateOrderEstimate()` in `useInventoryCalc.ts` で発注量算出
- 複数スケジュール対応・均等発注量表示
- 祝日は `useHolidays.ts` で判定

### 運用管理（`OpsAdminView.vue`）
- タブ: 串マスタ（`OpsSkewersTab.vue`）/ コース設定（`OpsCourseTab.vue`）/ 発注スケジュール（`OpsScheduleTab.vue`）
- `OpsCourseTab.vue` に月次売上目標（`monthly_sales_target`）の設定フォームあり

### システム管理（`SysAdminView.vue`）
- タブ: スタッフ管理（`SysStaffTab.vue`）/ 店舗管理（`SysTenantsTab.vue`、platform_admin のみ）/ システム設定（`SysSettingsTab.vue`）/ 監査ログ（`SysAuditTab.vue`）
- **スタッフ管理**: QR発行・スタッフ編集・所属店舗異動・無効化・削除
- **QR発行フロー**: `createQrInvitation()` → `manage-users` Edge Function → `user_invitations` に token 保存 → `RegisterView.vue` でスタッフが自己登録
- **画像保存**: `downloadQr()`（`<a download>`）/ **LINE等で共有**: `shareQr()`（Web Share API）
- **拠点店舗変更**: `SysSettingsTab.vue` に platform_admin 専用セクション（`updateHomeTenant()` in `auth.ts`）

### スタッフ登録（`RegisterView.vue`）
- URL: `/#/register?token=xxx`（認証不要）
- `validate_token` → `register_with_token`（Edge Function）
- Auth ユーザー作成（`email_confirm: true`）+ `public.users` 挿入

---

## 7. 外部連携（LINE通知）

### 仕組み

```
InputView.vue
  └─ useLineNotify.ts: buildLineMessage() でメッセージ構築
        └─ supabase.functions.invoke('send-line', { body: { message } })
              └─ send-line Edge Function
                    └─ settings.line_token を読み取り
                          └─ LINE Messaging API /v2/bot/message/broadcast へ POST
```

### トリガー条件
- 営業後入力フォームの送信完了時（`InputView.vue` の `handleSubmit()` 内）

### 送信内容（`buildLineMessage()` in `useLineNotify.ts`）

```
🍢 明日の仕込み yyyy/MM/dd(曜)
──────────────
◆ 串名  [仕込み量]  (在庫 XX本/P/B)  ← 仕込みあり
  串名  仕込みなし  (在庫 XX本)      ← 仕込みなし
──────────────
📊 今日 yyyy/MM/dd(曜)の実績
売上 ¥XX,XXX  ドリンク XX%
C{n}組 / S{n}組 / P{n}組  追加{n}本
合計 {n}本  焼師 {スタッフ名}
──────────────  ← メモあり時のみ
📝 {メモ内容}
```

### 使用API・関数
- Edge Function: `supabase/functions/send-line/index.ts`
- LINE API: `https://api.line.me/v2/bot/message/broadcast`
- 認証: `settings.line_token`（店舗ごとに設定、RLSで保護）
- フロント: `frontend/src/composables/useLineNotify.ts` の `buildLineMessage()` / `sendLineBroadcast()`

---

## 8. 店舗テーマカラー

### 設定場所
- `tenants.primary_color`（`#FF6B35` 形式の16進カラーコード）
- システム管理 → 店舗管理タブ（`SysTenantsTab.vue`）から設定

### 反映の仕組み（`frontend/src/stores/theme.ts`）

```typescript
// applyTenantColor(hex) が呼ばれると:
// 1. hex から RGB を計算し、白・黒とブレンドしてシェードを生成
// 2. CSS カスタムプロパティを document.documentElement に設定
//    --color-brand-50, 100, 400, 500, 600, 700
// 3. 色変更時は 0.3s トランジション
```

### 反映タイミング
- `auth.ts` の `initialize()` / `enterTenant()` 完了後に `TenantSwitcher.vue` や `App.vue` が `applyTenantColor(tenant.primary_color)` を呼ぶ
- Tailwind の `brand-*` クラスは CSS変数を参照するため、全UI要素が即座に切り替わる
- デフォルトカラー: `#FF6B35`（オレンジ）

---

## 9. ディレクトリ構成

```
yakitori-app-v2/
├── docs/
│   └── PROJECT_SUMMARY_FOR_AI.md   ← このファイル
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── supabase.ts          Supabaseクライアント
│   │   │   ├── roleRank.ts          ROLE_RANK定数・rolesAtLeast()
│   │   │   ├── fn-error.ts          Edge Functionエラー抽出
│   │   │   └── audit.ts             監査ログ記録ヘルパー
│   │   ├── types/
│   │   │   └── index.ts             全型定義（UserRole, DailyLog, Skewer等）
│   │   ├── stores/
│   │   │   ├── auth.ts              認証・テナント管理（enterTenant, updateHomeTenant等）
│   │   │   ├── dailyLog.ts          営業後ログ（fetchLatest, fetchRecentLogs, fetchSkewerStocks等）
│   │   │   ├── skewers.ts           串マスタCRUD
│   │   │   ├── settings.ts          システム設定（fetchSettings, saveSettings）
│   │   │   ├── users.ts             スタッフ管理（QR招待, 削除, 異動）
│   │   │   ├── tenants.ts           店舗管理
│   │   │   ├── tenantPermissions.ts manager のマルチテナント権限
│   │   │   ├── orderSchedule.ts     発注スケジュール
│   │   │   ├── prepLogs.ts          仕込み完了ログ
│   │   │   └── theme.ts             テーマ（ライト/ダーク/システム）+ applyTenantColor()
│   │   ├── composables/
│   │   │   ├── useInventoryCalc.ts  calcPrep, calculateOrderEstimate, buildLineMessage
│   │   │   ├── useAnalytics.ts      summarize, calcTrend, weekdayAvgSales, calcPeriodComparison,
│   │   │   │                        calcCustomerMetrics, detectAnomalies, getAnalyticsSummary
│   │   │   ├── useLineNotify.ts     sendLineBroadcast
│   │   │   └── useHolidays.ts       isHoliday（japanese-holidaysラッパー）
│   │   ├── router/
│   │   │   └── index.ts             ルート定義・beforeEachガード（認証・ロール・テナント選択）
│   │   ├── views/
│   │   │   ├── LoginView.vue        ログイン
│   │   │   ├── RegisterView.vue     QRコード自己登録
│   │   │   ├── SelectTenantView.vue 店舗選択（マルチテナント）
│   │   │   ├── HomeView.vue         ホーム（ナビカード、ロール別表示）
│   │   │   ├── InputView.vue        営業後入力
│   │   │   ├── DashboardView.vue    仕込みダッシュボード
│   │   │   ├── AnalyticsView.vue    分析・集計
│   │   │   ├── OrderView.vue        発注推定
│   │   │   ├── OpsAdminView.vue     運用管理
│   │   │   └── SysAdminView.vue     システム管理
│   │   └── components/
│   │       ├── PrepCard.vue         仕込み指示カード1枚
│   │       ├── TenantSwitcher.vue   ヘッダーの店舗切り替えボタン
│   │       ├── VisitingBanner.vue   他店舗訪問中バナー
│   │       ├── ops/
│   │       │   ├── OpsSkewersTab.vue    串マスタ編集タブ
│   │       │   ├── OpsCourseTab.vue     コース設定・月次目標タブ
│   │       │   └── OpsScheduleTab.vue   発注スケジュールタブ
│   │       └── sys/
│   │           ├── SysStaffTab.vue      スタッフ管理・QR発行タブ
│   │           ├── SysTenantsTab.vue    店舗管理タブ（platform_admin専用）
│   │           ├── SysSettingsTab.vue   システム設定タブ（LINE/PW/拠点店舗）
│   │           └── SysAuditTab.vue      監査ログタブ
│   └── tests/unit/
│       ├── useInventoryCalc.test.ts  仕込み計算・発注推定・LINE文面（55テスト）
│       ├── useAnalytics.test.ts      分析集計（11テスト）
│       ├── useHolidays.test.ts       祝日判定（4テスト）
│       ├── useLineNotify.test.ts     LINE通知（5テスト）
│       └── stores/dailyLog.test.ts   ペイロード生成・下書き（9テスト）
├── supabase/
│   ├── functions/
│   │   ├── manage-users/index.ts    スタッフ・QR・店舗管理 Edge Function
│   │   ├── enter-tenant/index.ts    テナント入店（active_tenant_sessions更新）
│   │   └── send-line/index.ts       LINE通知中継 Edge Function
│   └── migrations/
│       ├── 001〜020（後述）
│       └── cleanup_test_users.sql
├── scripts/
│   └── seed-test-data.mjs           テストDBへダミーデータ投入（90日分）
│                                    ※本番DBへの誤投入防止ガード付き
├── README.md
├── SETUP.md                         環境構築手順（詳細）
├── current-spec.md                  v1（GAS版）の機能仕様書（計算ロジックの根拠）
├── handoff.md                       ハンドオフドキュメント（やや古い）
├── upgrade-spec.md                  v1→v2 移行仕様書
├── analytics-and-env-split.md       分析強化・環境分離の実装指示書
├── operations-feedback.md           実運用フィードバック対応指示書（Item1〜3）
├── tenant-isolation-instructions.md テナント分離実装指示書
└── ui-fixes.md                      UI修正指示書
```

---

## 10. 仕様書ファイル索引

| ファイル | 内容 |
|--------|------|
| `README.md` | v2プロジェクト概要・技術スタック・開発コマンド |
| `SETUP.md` | 環境構築手順（テストDB作成、マイグレーション適用順、Edge Functionデプロイ） |
| `current-spec.md` | **v1（GAS版）の詳細仕様**。計算ロジック（仕込み・発注推定・LINE）の根拠文書。v2に移植済み |
| `handoff.md` | やや古いハンドオフ文書。ロール設計・スタッフ登録フロー・DB状況の概要 |
| `upgrade-spec.md` | v1→v2の移行方針・アーキテクチャ設計・DBスキーマ設計の初期仕様 |
| `analytics-and-env-split.md` | ①テスト/本番環境分離の実装手順（パートA）②分析強化機能の仕様（パートB） |
| `operations-feedback.md` | 実運用フィードバックへの対応指示書（3項目：拠点店舗・権限制御・QR改善） |
| `tenant-isolation-instructions.md` | テナント分離実装の詳細指示書 |
| `ui-fixes.md` | UIの修正指示書（375px対応等） |

---

## 11. 既知の課題・対応中の項目

### 実装済み（直近）
`operations-feedback.md` の3項目をすべて実装・本番デプロイ済み（2026-06-02）：

1. **プラットフォーム管理者の所属店舗（折衷案）**
   - `_isFreshLogin` フラグ（`auth.ts`）でログイン後に毎回店舗選択画面を表示
   - `updateHomeTenant()` 関数 + `SysSettingsTab.vue` に変更UIを追加
   - `migration 020_platform_admin_home_tenant.sql`: `users_update_self_platform_admin` RLSポリシー追加

2. **集計分析のロール別出し分け**
   - `/analytics` の `allowedRoles` を `['platform_admin', 'manager', 'store_owner']` に修正
   - スタッフのホームには分析・発注・管理系カードが非表示

3. **QR権限制御 + 画像共有**
   - QR役割セレクトが「自分より下位ロールのみ」に絞られる
   - `manage-users` Edge Function にもサーバー側 `ROLE_RANK` 検証を追加
   - 💾 画像を保存ボタン + 📤 共有ボタン（Web Share API）追加

### 未対応・今後の課題

| 項目 | 状況 |
|------|------|
| LINE Vault 暗号化 | `settings.line_token` は平文保存中。Supabase Vault による暗号化が推奨 |
| カスタム SMTP | 未設定。Supabase デフォルトのメール送信を使用中（招待メール未使用なので現状問題なし） |
| `prep_logs` テーブルのUI | テーブルは存在するが仕込み完了記録UIは未実装 |
| 複数店舗横断分析 | platform_admin 向けの横断ビューは未実装 |
| `order_schedule_irregulars` | DB設計の旧バージョン（`delivery_blackout_periods` に移行済みだが両方存在） |

### 開発ルール（変更時の注意）

- **テスト**: 計算ロジック変更時は `npm run test`（84テスト）を必ず通す
- **マイグレーション**: DB変更は `supabase/migrations/` に連番SQLを追加し `npx supabase db query --linked -f <file>` で適用
- **Edge Function変更**: `npx supabase functions deploy manage-users` で本番再デプロイが必要（`SETUP.md` 4章参照）
- **既存テスト・計算ロジックは変更禁止**（仕様上のルール）
- **本番DB誤操作防止**: `.env.local` はテストDBを向く。シードスクリプトには本番URL検出ガードあり

---

## 付録: Edge Function アクション一覧

### `manage-users`（`supabase/functions/manage-users/index.ts`）

| アクション | 認証 | 説明 |
|-----------|------|------|
| `validate_token` | 不要 | QRトークンの有効性確認 |
| `register_with_token` | 不要 | QRトークンで自己登録（Auth + users 挿入） |
| `create_qr_invitation` | store_owner以上 | QR招待発行（発行者より下位ロールのみ） |
| `reject_invitation` | store_owner以上 | QRトークン無効化 |
| `delete_user` | store_owner以上 | スタッフ削除（Authユーザーごと削除） |
| `force_signout` | store_owner以上 | 指定ユーザーの全セッションを強制失効 |
| `transfer_tenant` | manager以上 | スタッフの所属店舗異動 |
| `create_tenant` | store_owner以上 | 店舗作成 |
| `update_tenant` | store_owner以上 | 店舗名・テーマカラー更新 |
| `delete_tenant` | store_owner以上 | 店舗削除（スタッフ0名の場合のみ） |

### `enter-tenant`（`supabase/functions/enter-tenant/index.ts`）

- platform_admin / manager が別テナントに入店する際に呼ぶ
- `active_tenant_sessions` テーブルを upsert（service_role 権限で実行）

### `send-line`（`supabase/functions/send-line/index.ts`）

- LINE Messaging API へのブロードキャスト送信プロキシ
- `settings.line_token` を DBから取得して使用（トークンをフロントに露出させない）

---

## 付録: マイグレーション履歴

| ファイル | 主な変更内容 |
|---------|------------|
| `001_initial_schema.sql` | 全テーブル定義・インデックス |
| `002_rls_policies.sql` | 初期RLSポリシー |
| `003_seed_data.sql` | デフォルトテナント・設定データ |
| `004_new_roles_and_invitations.sql` | 新ロール定義・`user_invitations` テーブル |
| `005_qr_invitation.sql` | QRコード招待フロー対応 |
| `006_delivery_blackouts.sql` | `delivery_blackout_periods` / `delivery_irregular_dates` テーブル |
| `007_prep_logs.sql` | `prep_logs` テーブル（仕込み完了ログ） |
| `008_new_roles.sql` | `staff_both/kitchen/hall` / `store_owner` ロールを追加 |
| `009_tenants_platform_admin_only.sql` | `tenants` テーブルの挿入を platform_admin 専用に |
| `010_platform_admin_cross_tenant.sql` | platform_admin が全テナントにアクセス可能なRLS |
| `011_user_tenant_permissions.sql` | `user_tenant_permissions` テーブル・manager のマルチテナント対応 |
| `012_fix_role_hierarchy.sql` | ロールランク体系の修正・整合 |
| `013_staff_details_function.sql` | `get_staff_details()` RPC 関数追加（email/last_sign_in_at付き） |
| `014_security_hardening.sql` | `audit_logs` テーブル・セキュリティ強化 |
| `015_tenant_isolation.sql` | `current_tenant_id()` を active_tenant_sessions ベースに刷新 |
| `016_fix_cross_tenant_rls.sql` | platform_admin が他テナント訪問中でも自分のusersレコードを参照可能に |
| `017_active_tenant_sessions.sql` | `active_tenant_sessions` テーブル（JWTリフレッシュ不要化） |
| `018_tenant_primary_color.sql` | `tenants.primary_color` カラムを追加 |
| `019_monthly_sales_target.sql` | `settings.monthly_sales_target` カラムを追加 |
| `020_platform_admin_home_tenant.sql` | platform_admin が自分の `tenant_id` を更新できる RLS ポリシーを追加 |
