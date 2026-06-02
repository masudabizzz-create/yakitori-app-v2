# UI デザインシステム

> **正典（ソース・オブ・トゥルース）**: `frontend/src/views/HomeView.vue`
> このドキュメントは HomeView の実装から機械的に抽出したルールです。
> 他ページを改修するときはこのドキュメントを基準にしてください。

---

## 1. カラーシステム

### 1-1. テーマカラー変数

テーマカラーは CSS カスタムプロパティで管理します。**ハードコード16進は画面に出さない。**

| CSS 変数 | Tailwind クラス | 役割 |
|---|---|---|
| `--color-brand-50`  | `brand-50`  | 最も薄い面（アイコン円・バー背景） |
| `--color-brand-100` | `brand-100` | ボーダー（薄） |
| `--color-brand-400` | `brand-400` | グラデーション明端 |
| `--color-brand-500` | `brand-500` | ベースカラー（= `primary_color`） |
| `--color-brand-600` | `brand-600` | アイコン色（ライト） |
| `--color-brand-700` | `brand-700` | グラデーション暗端・テキスト |

Tailwind から使う場合は `rgb(var(--color-brand-X) / <alpha-value>)` の形式で解決されるため、
不透明度修飾子（例: `bg-brand-500/20`）がそのまま使えます。

### 1-2. テナントカラーの反映 — `applyTenantColor()`

**ファイル**: `frontend/src/stores/theme.ts`

```
テナント primary_color (hex) → applyTenantColor(hex)
  → hexToRgb() で [r, g, b] に変換
  → lerpRgb() で白 / 黒 方向に補間してシェードを生成
  → document.documentElement に --color-brand-{50|100|400|500|600|700} をセット
```

| シェード | 補間式 |
|---|---|
| `50`  | `lerp(base, white, 0.92)` |
| `100` | `lerp(base, white, 0.78)` |
| `400` | `lerp(base, white, 0.20)` |
| `500` | `base`（= primary_color そのもの） |
| `600` | `lerp(base, black, 0.10)` |
| `700` | `lerp(base, black, 0.28)` |

テナント切り替え時は `brand-transitioning` クラスで 0.3s のカラートランジションが付く。

デフォルトカラー（DB 未設定時）: `#FF6B35`

**実行タイミング**: `App.vue` の `watch([effectiveTenantId, accessibleTenants])` → 即時 + テナント切り替え時。

### 1-3. 固定色（テーマ非依存）

| Tailwind クラス | 実値 | 用途 |
|---|---|---|
| `bg-app` / `dark:bg-app-dark` | `#F5F5F5` / `#0F0F0F` | ページ全体の背景 |
| `bg-card` / `dark:bg-card-dark` | `#FFFFFF` / `#1A1A1A` | カード・コンテナ地 |
| `border-edge` / `dark:border-edge-dark` | `#E5E5E5` / `#2A2A2A` | ボーダー |
| `text-neutral-900` / `dark:text-neutral-50` | — | カード内主文字 |
| `text-neutral-500` / `dark:text-neutral-400` | — | カード内サブ文字 |

### 1-4. 用途別配色ルール（HomeView 確定版）

#### 訪問中バー (`VisitingBanner.vue`)
```
bg-brand-500/10  border-b border-brand-500/30
text: text-brand-700 dark:text-brand-400
```

#### 日付・天気バー
```
bg-brand-50 dark:bg-brand-500/20
border-b border-brand-100 dark:border-brand-500/30
text: text-brand-700 dark:text-brand-100
```
`dark:bg-brand-50` ではなく `dark:bg-brand-500/20` を使う。
理由: ダークモードで brand-50（白寄り）は背景と溶け合って見えなくなるため。

#### メインカード
```
bg-gradient-to-br from-brand-400 to-brand-700
dark:from-brand-500 dark:to-brand-700
```
文字はすべて `text-white` または `text-white/70`（サブ）。
統計ミニカード地: `bg-white/15`（透過白）。

#### 機能アイコン円
```
bg-brand-50 dark:bg-brand-500/20
アイコン色: text-brand-600 dark:text-brand-400
```

#### 機能カード地
```
bg-card dark:bg-card-dark
border border-edge dark:border-edge-dark
```

---

## 2. ボタン種別と配色

HomeView のボタン行: `[店舗切替] [テーマ切替] [ログアウト]`

### 主役ボタン（店舗切替）
グラデーション面上で目立たせるボタン。
```html
class="bg-brand-50 text-brand-700 hover:bg-white
       px-3 py-1.5 rounded-xl text-xs font-medium
       transition-colors active:scale-95"
```

### 補助ボタン（ログアウト）
グラデーション面上で控えめに置くボタン。
```html
class="text-white/70 hover:text-white
       border border-white/25 hover:border-white/50
       px-3 py-1.5 rounded-xl text-xs
       transition-colors active:scale-95"
```

### アイコンのみボタン（テーマ切替）
テキストなしで正方形のタップ領域を確保する。
```html
class="w-8 h-8 flex items-center justify-center
       text-white/70 hover:text-white
       border border-white/25 hover:border-white/50
       rounded-xl transition-colors active:scale-95"
:aria-label="`テーマ切替（現在: ${theme.mode}）`"
```
- `aria-label` は必須。スクリーンリーダー対応。
- タップ領域は最小 `w-8 h-8`（32px）。重要な操作は `min-h-tap`（44px）を検討。

---

## 3. カード・コンテナのスタイル

### メインカード
グラデーション背景のヘッダー区画。
```
px-4 py-5  shadow-md  rounded-none（フルブリード）
内部コンテナ: max-w-lg mx-auto space-y-4
```

### 機能カード（ナビグリッド）
```
rounded-2xl  px-3 py-5
bg-card dark:bg-card-dark
border border-edge dark:border-edge-dark
active:scale-[0.97] transition-transform
```
`rounded-2xl` = `1rem`（tailwind.config で定義済み）。

### 統計ミニカード（売上・串）
メインカード内に浮かぶ小型カード。
```
bg-white/15  rounded-2xl  px-3.5 py-3
```
ラベル: `text-[11px] text-white/60`
数値: `text-lg font-bold text-white tabular-nums`

### ページ内コンテナ共通
```
max-w-lg mx-auto px-4
```
セクション間の垂直余白: `py-4`（機能グリッド区画）。

---

## 4. アイコン方針

### ライブラリ
**`lucide-vue-next` v1.0.0**（`package.json` 実値）

```ts
import { PenLine, Utensils, Store, LogOut, Sun, Moon, Monitor, ... } from 'lucide-vue-next'
```

### 絵文字は使わない
- NG: `<span>☀️</span>` `<span>🍢</span>`
- OK: `<Sun :size="16" />` `<component :is="wmoIcon(code)" :size="16" />`

例外: `VisitingBanner.vue` の `👁`（既存・未改修）。新規実装には使わない。

### サイズ規則
| 用途 | `:size` 値 |
|---|---|
| 機能カードアイコン（円内） | `22` |
| ナビバー・ボタン内 | `13〜16` |
| 日付・天気バー内 | `16` |
| アイコンのみボタン | `14` |

### 機能カードのアイコン円
```html
<div class="w-12 h-12 rounded-full flex items-center justify-center
            bg-brand-50 dark:bg-brand-500/20">
  <component :is="card.icon" :size="22"
             class="text-brand-600 dark:text-brand-400" />
</div>
```

---

## 5. タイポグラフィ

フォント: **Noto Sans JP**（`frontend/src/style.css` で Google Fonts から読み込み）
フォールバック: `system-ui, sans-serif`

| 用途 | クラス |
|---|---|
| アプリ名（串在庫管理） | `text-[11px] font-semibold text-white/70` |
| テナント名 | `text-base font-bold text-white` |
| ユーザー名 | `font-semibold text-white` |
| ロールバッジ | `text-[11px] bg-white/20 text-white/90 px-2.5 py-0.5 rounded-full` |
| 統計ラベル | `text-[11px] text-white/60` |
| 統計数値 | `text-lg font-bold text-white tabular-nums` |
| 機能名 | `text-sm font-semibold text-neutral-900 dark:text-neutral-50` |
| 機能サブテキスト | `text-[11px] text-neutral-500 dark:text-neutral-400` |
| 日付 | `text-sm font-semibold text-brand-700 dark:text-brand-100` |

**太字の使用方針**:
- `font-bold`: 数値・強調ラベル（統計値、テナント名）
- `font-semibold`: セクション見出し・機能名・ユーザー名
- `font-medium`: ボタンラベル

---

## 6. レイアウト原則

### 375px 幅対応
- 全コンテナ: `max-w-lg mx-auto px-4`（最大 512px、375px では px-4=16px 余白）
- テキストは `truncate`（テナント名など長くなる箇所）か `flex-wrap` で折り返し
- ボタン行: `flex items-center gap-2`（2〜3ボタンが横並びで収まる余白設計）

### グリッド
機能ナビ: `grid grid-cols-2 gap-3`
統計ミニカード: `grid grid-cols-2 gap-2.5`

### 縦の色の流れ（HomeView の構成）
```
① VisitingBanner    — brand-500/10（最薄・条件表示）
② 日付・天気バー    — brand-50（薄テーマ）
③ メインカード      — brand-400→brand-700（濃テーマ・グラデーション）
④ 機能グリッド      — bg-app（ベース：中間調グレー）
```
上から「薄 → 濃 → ベース」という流れ。新セクションを追加する場合もこの原則に従う。

---

## 7. ダークモード対応

### 仕組み
`useThemeStore` が `<html>` タグに `class="dark"` を付け外しする。
Tailwind の `darkMode: 'class'` 設定で `dark:` プレフィックスが有効になる。

### 淡色面がダークで破綻しないための対応

| ライト | ダーク | 理由 |
|---|---|---|
| `bg-brand-50` | `dark:bg-brand-500/20` | brand-50 は白寄りのため、ダーク背景で目立たない |
| `border-brand-100` | `dark:border-brand-500/30` | 同上 |
| `text-brand-700` | `dark:text-brand-100` | ダーク面では明るい文字が必要 |

### グラデーション
```
from-brand-400 to-brand-700
dark:from-brand-500 dark:to-brand-700
```
ライトより暗端を明端に寄せることで、ダーク時に明るすぎる状態を避ける。

### 文字コントラスト
- グラデーション面: すべて `text-white` か `text-white/70` 以上（白を基準）
- ベース面: `text-neutral-900 dark:text-neutral-50`
- サブ: `text-neutral-500 dark:text-neutral-400`

---

## 8. 状態・データなし表示

HomeView の実装から一般則化したフォールバック方針:

| 状況 | 対応 |
|---|---|
| データ取得中 | 数値を `'...'` に置換 + `opacity-40` で視覚的に「待機中」を示す |
| データなし（正常） | ラベルを「最新の売上」等のプレースホルダー文言に変更。数値は `—`（ダッシュ） |
| 取得失敗（非致命的） | 要素ごと非表示（`v-if`）。ページ全体は壊れない。エラーメッセージは出さない |
| 取得失敗（致命的でない外部 API） | `try/catch` で握りつぶし。ログも出さない |

**天気の例**:
```html
<!-- weather_code が取得できたときだけ表示。失敗時は日付のみ残る -->
<div v-if="weather?.weather_code != null"> ... </div>
```

**統計の例**:
```ts
{{ dailyLogStore.loadingLatest ? '...' : formatSales(latestLog?.total_sales) }}
```

---

## 9. 横展開チェックリスト

他ページを改修・新規作成するとき、以下を確認してください。

### カラー
- [ ] `--color-brand-*` 変数（`brand-50` 〜 `brand-700`）のみ使用している
- [ ] ハードコード16進カラーが新たに書かれていない
- [ ] 淡色面に `dark:bg-brand-500/20`（`dark:bg-brand-50` ではない）を使っている
- [ ] テキストに `dark:text-brand-100`（ダーク向け明色）を使っている

### レイアウト
- [ ] コンテナに `max-w-lg mx-auto px-4` がある
- [ ] 375px 実機（または DevTools モバイルビュー）で崩れていない
- [ ] `truncate` または `flex-wrap` で長テキストが溢れない

### ボタン
- [ ] グラデーション面上の補助ボタンは `border-white/25` 系を使っている
- [ ] アイコンのみボタンに `aria-label` がある

### アイコン
- [ ] `lucide-vue-next` から import している
- [ ] 絵文字をアイコンの代わりに使っていない
- [ ] サイズ規則（機能カード内 22px / ボタン内 13〜16px）に従っている

### ダークモード
- [ ] すべての背景・文字・ボーダーに `dark:` バリアントがある
- [ ] グラデーション区画に `dark:from-*` / `dark:to-*` がある

### 状態・データなし
- [ ] ロード中に `opacity-40` または `'...'` 表示がある
- [ ] データなし時に `'—'` または意味のあるプレースホルダーがある
- [ ] 非致命的な取得失敗時にページ全体が壊れない

### ロール・権限
- [ ] `visibleCards` 相当の `v-if` によるロール出し分けが維持されている
- [ ] `ROLE_RANK` を使った比較で新しいロールを除外していない

### その他
- [ ] `font-variant-numeric: tabular-nums`（クラス `tabular-nums`）を数値列に使っている
- [ ] スクロールバーは非表示（`no-scrollbar` クラス）

---

## 補足: 実装との乖離（要確認事項）

HomeView のドキュメント化にあたり、以下の点が「ルールと実装が完全には一致していない」と判断した箇所です。修正方針はオーナーに委ねます。

1. **`VisitingBanner.vue` の絵文字 `👁`**
   アイコン方針（lucide 統一・絵文字禁止）と矛盾。ただし既存コンポーネントのため本ドキュメントでは例外扱いと記載済み。

2. **`style.css` の `body { background-color: #f5f5f5; }` ハードコード**
   Tailwind の `bg-app`（`#F5F5F5`）と実値は同じだが、CSS 変数を経由していない。
   `bg-app` は Tailwind 拡張色で JS 管理できないため許容範囲ともいえるが、原則と微妙に矛盾する。

3. **タップ領域の一部不足**
   テーマ切替ボタンは `w-8 h-8`（32px）。iOS HIG 推奨の 44px に届いていない。
   `min-h-tap`（44px）はtailwind.config で定義済みのため、必要なら適用可能。
