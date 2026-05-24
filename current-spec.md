# 串在庫管理アプリ 機能仕様書

> 作成日: 2026-05-22  
> 対象: Google Apps Script WebApp（GAS + Spreadsheet）

---

## 1. 画面・機能一覧

### ホーム画面 (`home.html`)
- **URL**: `?page=home`（デフォルト、省略可）
- **認証**: なし
- **機能**
  - 串在庫管理のトップページ
  - 現在日付・曜日をヘッダーに表示
  - Google DriveのヒーローイメージをBase64でロードして表示（`HERO_IMAGE_ID` スクリプトプロパティ参照）
  - 5つのナビゲーションカードから各画面へ遷移
  - `sessionStorage` で前回ページを記憶し、リロード時に自動リダイレクト

| カード | 遷移先 | 概要 |
|---|---|---|
| 📝 営業後入力 | `?page=index` | 在庫入力・LINE送信 |
| 📊 分析・集計 | `?page=analytics` | 売上・曜日別トレンド |
| 🔧 運用管理 | `?page=ops_admin` | 串マスタ・理想在庫・コース設定 |
| ⚙️ システム管理 | `?page=sys_admin` | スタッフ・PW・LINEトークン |
| 📦 発注推定 | `?page=order` | 週間来客数から発注推奨量を算出 |

---

### 営業後入力 (`index.html`)
- **URL**: `?page=index`
- **認証**: なし（スタッフ選択のみ）
- **機能**
  - 串の残り在庫を入力（カテゴリ別ステッパー）
  - 売上データ入力（コース別組数・追加串・総売上・ドリンク比率・メモ）
  - 担当スタッフ選択
  - 合計串本数の自動計算
  - 翌日が日曜の場合に「明日は日曜日」バナーを表示
  - 確認モーダル表示後、サーバーへ送信（`submitDailyReport`）
  - 送信完了後、仕込み計算結果とLINE通知を実行

**カテゴリ別入力方式**

| カテゴリ | 入力単位 | 内部保存単位 |
|---|---|---|
| レギュラー | P（パック） | P × 20本 |
| スペシャル | 本 | 本 |
| つくね | B（袋） | B × 40本 |
| 前日仕込み | P（パック） | P × 20本 + 昆布締め済みフラグ |
| その他仕込み | 仕込み中チェックのみ | 999（仕込み中）/ 0（なし） |

---

### 分析・集計 (`analytics.html`)
- **URL**: `?page=analytics`
- **認証**: なし
- **機能**
  - 集計期間選択: 7日 / 14日 / 30日 / 90日
  - タブ: 📊分析 / 📋ログ

**分析タブ**
- サマリーカード: 総売上・日平均売上・トレンド（↑↓→）、総串本数・日平均、ドリンク比率平均バー
- コース内訳: カジュアル / スタンダード / プレミアム 件数・構成比
- 曜日別平均売上バーチャート（月〜土）
- ドリンク比率推移バーチャート（直近10日）
- 日次ログテーブル

**ログタブ**
- 日ごとカード: 売上・串本数・コース組数・ドリンク% ・メモ

**トレンド計算**: 指定期間を前半・後半に二分し、後半が前半より高ければ↑、低ければ↓、同程度なら→

---

### 運用管理 (`ops_admin.html`)
- **URL**: `?page=ops_admin`
- **認証**: 運用管理パスワード（`verifyOpsPassword`）
- **機能**（タブ3つ）

**串マスタタブ**
- 串一覧のインライン編集（名前・カテゴリ・有効フラグ）
- 曜日別理想在庫のモーダル設定
- 発注設定モーダル: コース分類（全コース/特定コース選択）・1本あたり重量g・歩留まり率・発注単位ラベル・発注単位g
- 前日仕込み用の仕込み方法名入力（デフォルト: 昆布締め）
- 串の追加・削除
- 「フォームを更新」ボタン → Google Formを自動生成/更新（`createOrUpdateGoogleForm`）
- `saveSkewers()` で保存

**コース設定タブ**
- 日曜ブースト有効/無効
- コース価格: カジュアル / スタンダード / プレミアム（円）
- コースあたり串本数: カジュアル / スタンダード / プレミアム（本）
- `saveOpsSettings(opsPassword, data)` で保存

**発注スケジュールタブ**
- 通常スケジュール（複数登録可）
  - 締め曜日・納品曜日・平日上振れ率・祝日上振れ率
- 例外スケジュール（日付指定）
  - 対象週開始日・締め日・納品日・上振れ率・備考
- `saveOrderSchedules(opsPassword, data)` / `saveOrderScheduleIrregulars(opsPassword, data)` で保存

---

### システム管理 (`sys_admin.html`)
- **URL**: `?page=sys_admin`
- **認証**: 管理者パスワード（`verifyAdminPassword`）
- **機能**（タブ2つ）

**スタッフ管理タブ**
- スタッフ一覧: 名前・役割（admin/manager/user）・有効フラグ
- スタッフ追加・編集・削除
- `saveUsers()` で保存

| 役割 | 権限 |
|---|---|
| admin（管理者） | 全機能 |
| manager（マネージャー） | 入力 + 運用管理 |
| user（スタッフ） | 入力のみ |

**システム設定タブ**
- 管理者パスワード変更
- 運用管理パスワード変更
- LINE Messaging APIトークン設定
- `saveSystemSettings(adminPassword, data)` で保存

---

### 発注推定 (`order.html`)
- **URL**: `?page=order`
- **認証**: なし
- **機能**
  - 過去の曜日別来客数（コース組数）を週ごとに入力
  - 入力値は `localStorage`（キー: `yakitori_guests_v1`）に自動保存、ページ再訪時に復元
  - 祝日はGoogle Calendar API（日本祝日カレンダー）で自動判定して色分け表示
  - 現在庫入力（任意）→ 在庫控除後の発注量を算出
  - 発注スケジュール（複数回納品）を `ops_admin` から取得し、納品回ごとの発注推奨量を算出
  - 結果テーブル: 串名・使用推定本数（上振れ適用）・必要原材料g・発注量・発注単位
  - 複数スケジュール時は最下部に「均等発注量」セクションを表示

---

## 2. データ構造

### スプレッドシートのシート一覧

| シート名 | 用途 |
|---|---|
| `skewers` | 串マスタ |
| `daily_log` | 日次営業ログ |
| `settings` | システム設定（KV形式） |
| `users` | スタッフ情報 |
| `order_schedule` | 通常発注スケジュール |
| `order_schedule_irregular` | 例外発注スケジュール |
| `prep_calc` | 仕込み計算用（初期化のみ、現在未使用） |

---

### `skewers` シート（22列）

| 列 | カラム名 | 内容 |
|---|---|---|
| A | 串名 | 串の名前（文字列） |
| B | カテゴリ | レギュラー / スペシャル / つくね / 前日仕込み / その他仕込み / 副産物 |
| C | 理想_月 | 月曜日の理想在庫本数 |
| D | 理想_火 | 火曜日の理想在庫本数 |
| E | 理想_水 | 水曜日の理想在庫本数 |
| F | 理想_木 | 木曜日の理想在庫本数 |
| G | 理想_金 | 金曜日の理想在庫本数 |
| H | 理想_土 | 土曜日の理想在庫本数 |
| I | 理想_日 | 日曜日の理想在庫本数 |
| J | 単位 | 1パック/1袋あたりの本数（レギュラー=20、つくね=40） |
| K | 閾値1 | 仕込量1を発動する在庫閾値（スペシャル・その他仕込み用） |
| L | 仕込量1 | 閾値1以下のときの仕込み量（本） |
| M | 閾値2 | 仕込量2を発動する在庫閾値 |
| N | 仕込量2 | 閾値2以下のときの仕込み量（本） |
| O | 有効 | TRUE/FALSE |
| P | 仕込み名 | 前日仕込みの方法名（例: 昆布締め） |
| Q | コース分類 | `all_courses` / `specific_courses` |
| R | 対象コース | `casual,standard,premium` のカンマ区切り（specific_courses時のみ） |
| S | 重量g/本 | 1本あたりの原材料重量（g） |
| T | 歩留まり率 | 歩留まり（0〜1、デフォルト1.0） |
| U | 発注単位 | 発注単位ラベル（例: kg, 枚） |
| V | 発注単位g | 1発注単位あたりのグラム数 |

> **indexの付け方**: ヘッダー行（行1）を除いた0始まりの行番号。`getSkewers()`/`getSkewersAll()` でフロントへ渡す際に `index` プロパティとして付与される。

---

### `daily_log` シート（13+n列）

| 列 | 内容 |
|---|---|
| A | 日付（yyyy/MM/dd） |
| B | 曜日（例: 月曜） |
| C | スタッフ名 |
| D | 入力時刻（yyyy/MM/dd HH:mm:ss） |
| E | カジュアルコース組数 |
| F | スタンダードコース組数 |
| G | プレミアムコース組数 |
| H | 追加串（本） |
| I | 合計串（本） |
| J | 総売上（円） |
| K | ドリンク売上（円） |
| L | ドリンク比率（%） |
| M〜 | 各串在庫（副産物を除く）。末尾に文字列があればメモ |

---

### `settings` シート（KV形式、2列）

| キー | 内容 | デフォルト |
|---|---|---|
| `admin_password` | 管理者パスワード | `changeme` |
| `ops_password` | 運用管理パスワード | `changeme` |
| `line_token` | LINE Messaging APIトークン | 空 |
| `sunday_boost_enabled` | 日曜ブースト有効フラグ | `TRUE` |
| `course_casual_price` | カジュアルコース価格（円） | `3500` |
| `course_standard_price` | スタンダードコース価格（円） | `4500` |
| `course_premium_price` | プレミアムコース価格（円） | `5800` |
| `course_casual_skewers` | カジュアルコースの串本数 | `10` |
| `course_standard_skewers` | スタンダードコースの串本数 | `15` |
| `course_premium_skewers` | プレミアムコースの串本数 | `20` |

> パスワードとLINEトークンは `settings` シートとは別に `PropertiesService`（スクリプトプロパティ）にも二重保存される。読み取り時はスクリプトプロパティを優先する。

---

### `users` シート（3列）

| 列 | 内容 |
|---|---|
| A | スタッフ名 |
| B | 役割（admin / manager / user） |
| C | 有効（TRUE/FALSE） |

---

### `order_schedule` シート（4列）

| 列 | 内容 |
|---|---|
| A | 締め曜日（0=日, 1=月, ..., 6=土） |
| B | 納品曜日（同上） |
| C | 平日上振れ率（例: 0.10 = 10%増） |
| D | 祝日上振れ率（例: 0.15 = 15%増） |

> 複数行登録可（複数回納品に対応）。

---

### `order_schedule_irregular` シート（6列）

| 列 | 内容 |
|---|---|
| A | 対象週開始日（日付） |
| B | 締め日（日付） |
| C | 納品日（日付） |
| D | 平日上振れ率 |
| E | 祝日上振れ率 |
| F | 備考（文字列） |

---

### スクリプトプロパティ（PropertiesService）

| キー | 内容 |
|---|---|
| `SPREADSHEET_ID` | 接続するSpreadsheetのID（必須） |
| `ADMIN_PASSWORD` | 管理者パスワード（settingsシートと同期） |
| `OPS_PASSWORD` | 運用管理パスワード（settingsシートと同期） |
| `LINE_TOKEN` | LINE Messaging APIトークン（settingsシートと同期） |
| `HERO_IMAGE_ID` | ホーム画面ヒーロー画像のGoogle Drive FileID |
| `FORM_ID` | Google FormのID（フォーム連携時） |

---

## 3. 計算ロジック

### 仕込み計算（`calcPrep`）

**前提**: 毎営業日終了後に呼ばれ、「翌日の仕込み指示」を生成する。

#### レギュラー・つくね
```
needed = ideal[dayOfWeek] - stock
bags   = ceil(needed / unit)       ※ needed > 0 のとき
prepAmount = bags * unit
```
- **日曜ブースト**（`sunday_boost_enabled = TRUE` かつ `dayOfWeek ≠ 0`）
  - レギュラーのみ対象
  - `boostedIdeal = idealByDay[dayOfWeek] + round(idealByDay[dayOfWeek] * (1 / daysUntilSunday))`
  - `daysUntilSunday = 7 - dayOfWeek`

#### スペシャル・その他仕込み（閾値方式）
```
if stock <= threshold2 → prepAmount = prep2
elif stock <= threshold1 → prepAmount = prep1
else → prepAmount = 0
```

#### 前日仕込み
```
kombu（昆布締め済みフラグ）が true  → action = 'skewer_kombu'（串うち）
stock >= idealByDay[dayOfWeek]      → action = 'none'（仕込みなし）
stock > threshold2                  → action = 'kombu'（昆布締め開始）
それ以外                            → action = 'skewer_direct'（直接串うち）
```

#### 副産物
- `calcPrep` で完全にスキップ（results に含まれない）

---

### 合計串本数の計算（`index.html` フロントエンド）
```
totalSkewers = casual   × course_casual_skewers
             + standard × course_standard_skewers
             + premium  × course_premium_skewers
             + extraSkewers
```

### ドリンク売上の計算（`submitDailyReport`）
```
drinkSales = round(totalSales × drinkRatio / 100)
```

---

### 発注推定計算（`calculateOrderEstimate`）

#### 入力パラメータ
| パラメータ | 内容 |
|---|---|
| `dailyData[]` | 週間の曜日別データ（courseCasual, courseStandard, coursePremium, dayOfWeek, isHoliday） |
| `stocks{}` | 現在庫（インデックス→本数） |
| `schedules[]` | 発注スケジュール（deadlineDow, deliveryDow, upliftWeekday, upliftHoliday） |

#### カバー日の割り当て（複数スケジュール時）
```
schedule[i] が担当する曜日 = deliveryDow[i] 〜 deliveryDow[i+1] の前日まで
（循環: 最後のスケジュールは次の最初のスケジュールの前日まで）
```

#### 使用推定本数
```
// 各日について
dayUsage = コース組数合計（courseType='all_courses'）
         または 対象コース組数合計（courseType='specific_courses'）

// 上振れ適用
upliftedDayUsage = dayUsage × (1 + (isHoliday ? upliftHoliday : upliftWeekday))

// 期間合計
upliftedUsage = round(Σ upliftedDayUsage)
```

#### 必要原材料・発注量
```
requiredMaterialG = round(upliftedUsage × weightPerStickG / yieldRate)
orderQty          = ceil(requiredMaterialG / orderUnitG)

// 在庫控除あり（stocks[index] >= 0）の場合
remainAfterG      = max(0, requiredMaterialG - stockVal × weightPerStickG / yieldRate)
orderQtyWithStock = ceil(remainAfterG / orderUnitG)
```

> `weightPerStickG = 0` または `orderUnitG = 0` の串は発注量の計算対象外（「設定なし」表示）。

#### 均等発注量（複数スケジュール時）
- 同一の串について全スケジュール分の `orderQty` を合算し、スケジュール数で割った平均値を表示する。

---

## 4. LINE通知

### いつ送るか
- 営業後入力（`index.html`）のフォーム送信時（`submitDailyReport`）に自動送信
- Google Forms経由で回答送信された場合も同じトリガー（`processFormResponse`）を経由して送信

### 誰に送るか
- LINE Messaging API の **ブロードキャスト送信**（`/v2/bot/message/broadcast`）
- 送信先: LINE公式アカウントの全友だち（トークン設定が必要）

### 何を送るか
メッセージフォーマット（`buildLineMessage`）:

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

**仕込み量の単位変換（`unitDisplay`）**

| カテゴリ | 表示形式 |
|---|---|
| レギュラー | `{本数÷20}P` |
| 前日仕込み | `{本数÷20}P` |
| つくね | `{本数÷40}B`（割り切れない場合は本） |
| その他 | `{本数}本` |

**前日仕込みのアクション表示**

| action | LINE表示 |
|---|---|
| `skewer_kombu` | `串うち（昆布締め済み）` |
| `kombu` | `昆布締め開始` |
| `skewer_direct` | `昆布締めなし・直接串うち` |

---

## 5. 認証

| 画面 | 認証方式 | 使用関数 | 備考 |
|---|---|---|---|
| ホーム (`home`) | なし | — | — |
| 営業後入力 (`index`) | なし | — | スタッフ選択のみ（パスワードなし） |
| 分析・集計 (`analytics`) | なし | — | — |
| 運用管理 (`ops_admin`) | 運用管理パスワード | `verifyOpsPassword` | 各保存操作でも毎回パスワードを引数として送信・再検証 |
| システム管理 (`sys_admin`) | 管理者パスワード | `verifyAdminPassword` | 各保存操作でも毎回パスワードを引数として送信・再検証 |
| 発注推定 (`order`) | なし | — | — |

**パスワードの保存場所**

1. `settings` シート（KVペア `admin_password` / `ops_password`）
2. スクリプトプロパティ `ADMIN_PASSWORD` / `OPS_PASSWORD`（優先参照）

**パスワードの照合**
- 平文の単純一致（ハッシュなし）
- `verifyAdminPassword(password)` → `{ success: true, valid: bool }`
- `verifyOpsPassword(password)` → `{ success: true, valid: bool }`

**フロントエンドのセッション管理**
- パスワードはページ内の変数（`let adminPassword`）に保持
- ページリロードで消える（永続化なし）
- ログアウトはページ離脱で自動的に失効

**`getSettings()`（認証なし）**
- `admin_password` を `'****'` に置換して返す（セキュリティ上の配慮）

**`saveSettings()`（旧管理画面 `admin.html` 用）**
- パスワード検証なし（非推奨の旧API。`admin.html` からのみ呼ばれる）

---

## 6. スタッフ情報

### 管理場所
- Spreadsheet の `users` シート（3列: 名前・役割・有効フラグ）

### 取得方法
- `getUsers()`: 有効（active=TRUE）なスタッフのみを `{ name, role }` で返す
- `getUsersAll()`: 全スタッフを `{ name, role, active }` で返す（システム管理画面用）

### 役割（role）定義
| 値 | 表示名 | 権限 |
|---|---|---|
| `admin` | 管理者 | 全機能（システム管理含む） |
| `manager` | マネージャー | 入力 + 運用管理 |
| `user` | スタッフ | 入力のみ |

> 現在の実装ではロール別アクセス制御はフロントエンドのUIに依存しており、GAS側では管理者パスワード/運用管理パスワードによる認証のみが保護されている。

### 編集方法
- `sys_admin.html`（システム管理 → スタッフ管理タブ）から追加・編集・削除
- `saveUsers(usersData)` でシートを全件上書き保存

### 営業後入力での使用
- `index.html` 起動時に `getUsers()` を呼び出し、有効スタッフのみをドロップダウンに表示
- 選択されたスタッフ名が `daily_log` シートとLINEメッセージに記録される

### Google Forms連携での使用
- `createOrUpdateGoogleForm()` 実行時に `getUsers()` の名前リストをプルダウン選択肢として設定
- フォーム回答から `今日の焼師` の回答値が `staffName` として処理される
