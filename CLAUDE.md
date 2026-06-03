# CLAUDE.md — Claude へのルール

## ブランチ戦略（必ず守ること）

### コミット先は常に `develop`
- **すべての実装・修正は `develop` ブランチにコミットする**
- `main` ブランチへの直接コミットは禁止
- 作業開始前に必ず現在のブランチを確認する：`git branch --show-current`
- もし `main` にいたら `git checkout develop` してから作業する

### 本番（main）へのマージは必ず確認を取る
- `develop` での作業が完了し、本番反映が必要な場合は：
  1. ユーザーに「本番（main）にマージしてよいですか？」と確認する
  2. **「はい」の明示的な返答を受けてから** PR作成・マージを行う
  3. マージ後はCI/CDが自動でマイグレーション適用＋デプロイを行う

---

## 環境構成

| ブランチ | Supabase プロジェクト | 用途 |
|---|---|---|
| `develop` | `btisymjzessywsceieru` (staging) | 日々の開発・動作確認 |
| `main` | `mmquefvklrxjcmoxgvjb` (production) | 本番 |

### ローカル開発環境
- `.env` → `btisymjzessywsceieru`（staging）に接続
- `npm run dev` でローカルサーバー起動

### Supabase CLI
- 本番操作時は `npx supabase link --project-ref mmquefvklrxjcmoxgvjb` でリンク
- staging操作時は `npx supabase link --project-ref btisymjzessywsceieru` でリンク
- **マイグレーション適用は `develop` で動作確認後、`main` マージ時にCIが自動実行**

---

## プロジェクト概要

焼鳥店向け営業管理アプリ。Vue 3 + TypeScript + Supabase + GitHub Pages。

### 主な機能
- 営業後入力（daily_logs）
- 仕込みダッシュボード（在庫計算）
- LINE通知（send-line Edge Function）
- 天気データ自動取得（fetch-weather Edge Function）

### 技術スタック
- Frontend: Vue 3 / TypeScript / Vite / Tailwind CSS / Pinia
- Backend: Supabase (PostgreSQL / PostgREST / Edge Functions)
- Deploy: GitHub Pages (CI/CD via GitHub Actions)

### 重要なルール
- 既存のテスト・計算ロジックは一切触らない
- 各項目完了後に `npm run test` で全テスト通過確認
- 不明点は実装前に必ず確認する
- lucide-vue-next のみ使用（絵文字はアイコン代替に使わない）
