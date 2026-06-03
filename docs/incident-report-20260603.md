# 障害レポート・是正対応レポート

**障害番号**: INC-2026-001  
**発生日**: 2026年6月3日  
**対応完了日**: 2026年6月3日  
**作成日**: 2026年6月3日  

---

## 1. 障害概要

### 事象
本番環境（GitHub Pages）の「営業後入力」フォームから送信操作を行うと、送信が失敗しデータが保存されない状態となった。

### エラーメッセージ
```
Could not find the 'groups_count' column of 'daily_logs' in the schema cache
```

### 影響範囲
| 項目 | 内容 |
|---|---|
| 影響機能 | 営業後入力（送信不可）・LINE通知（未送信） |
| 影響環境 | 本番環境のみ（GitHub Pages） |
| 影響期間 | 2026年6月2日 feat実装デプロイ〜6月3日修正完了まで |
| 影響ユーザー | 全ユーザー（全テナント） |

---

## 2. 根本原因

### 直接原因
本番Supabaseプロジェクト（`mmquefvklrxjcmoxgvjb`）に対して、マイグレーション `021_groups_guests_weather.sql` が適用されていなかった。

フロントエンドのコードは `groups_count` / `guests_count` カラムへのINSERTを行う実装に更新されていたが、本番DBにそのカラムが存在しないためPostgREST（APIレイヤー）がエラーを返した。

### 根本原因
**開発環境と本番環境のSupabaseプロジェクトが分離されていたにもかかわらず、その管理ルールが整備されていなかった。**

| 環境 | Supabaseプロジェクト |
|---|---|
| ローカル開発（`.env`） | `btisymjzessywsceieru`（staging） |
| 本番（GitHub Pages） | `mmquefvklrxjcmoxgvjb`（production） |

マイグレーションは `supabase link` が staging プロジェクトに向いた状態で実行されたため、本番DBには適用されなかった。

### 調査過程での誤判断
- DBのカラム存在確認・PostgRESTのスキーマキャッシュリロード・NOTIFY送信をすべてstagingプロジェクトに対して実施し、正常動作を確認。
- その間「本番プロジェクトへの誤接続」の可能性を見落とし、原因特定に時間を要した。
- GitHub Actionsのワークフローで `secrets.VITE_SUPABASE_URL`（本番）が使われていることを確認して初めて2プロジェクトの乖離を発見した。

---

## 3. タイムライン

| 時刻（JST） | 出来事 |
|---|---|
| 6/2 13:58 | `feat: 組数・客数の実入力化` をmainにデプロイ（本番DBへのマイグレーション未適用のままコードのみ更新） |
| 6/3 00:12 | InputView送信フロー修正コミット完了 |
| 6/3 午前 | ユーザーより「送信できない」報告・調査開始 |
| 6/3 午前 | staging DBへのマイグレーション適用（誤ったプロジェクトへ） |
| 6/3 午前 | PostgREST NOTIFY・スキーマキャッシュリロード試行（staging に対して）→ 効果なし |
| 6/3 午前 | GitHub ActionsのSecretsからデプロイ先が本番プロジェクト（`mmquefvklrxjcmoxgvjb`）であることを確認 |
| 6/3 午前 | **本番DBへのマイグレーション適用・PostgRESTリロード実施** |
| 6/3 午前 | ユーザーによる動作確認→送信成功を確認 |
| 6/3 07:13 | 是正対応（2ブランチ戦略・CI自動マイグレーション）をコミット |
| 6/3 07:30 | staging自動テストワークフローをコミット |

---

## 4. 実施した是正対応

### 即時対応（恒久修正）
- 本番Supabaseプロジェクト（`mmquefvklrxjcmoxgvjb`）へ `021_groups_guests_weather.sql` を適用
- PostgRESTスキーマキャッシュをリロード
- 動作確認：送信正常完了・LINE通知正常送信

### 再発防止策

#### ① ブランチ戦略の導入（`develop` / `main` 分離）
```
develop ブランチ → staging（btisymjzessywsceieru）
main ブランチ    → 本番（mmquefvklrxjcmoxgvjb）
```
- 日々の開発はすべて `develop` ブランチで実施
- 本番反映は `develop` → `main` へのPRマージで行い、必ず確認を経る

#### ② CI/CDへのマイグレーション自動適用
`.github/workflows/ci.yml` を修正し、`main` へのpush時に自動でマイグレーションを適用：
```yaml
- name: Apply migrations to production
  run: |
    supabase link --project-ref mmquefvklrxjcmoxgvjb
    for f in supabase/migrations/*.sql; do
      supabase db query --linked -f "$f"
    done
```
これにより「コードが更新されたのにDBが古い」という乖離が発生しなくなる。

#### ③ CLAUDE.mdによるブランチルールの明文化
- Claudeが常に `develop` にコミットすることをルール化
- `main` へのマージ前に必ずユーザーの確認を取ることをルール化

#### ④ staging自動テストの整備
毎日JST 23:30にGitHub Actionsでstagingへダミーデータを投入し、送信フロー・LINE通知を自動検証するワークフローを追加（`.github/workflows/staging-daily-seed.yml`）。

---

## 5. 対応後の環境構成

```
[開発]
  Claude / 開発者
       ↓ commit
  developブランチ
       ↓ push
  GitHub Actions (CI)
    - テスト実行
    - staging環境でビルド確認
    - 毎日23:30: ダミーデータ投入 + LINE通知テスト

[本番反映]
  開発者が確認・承認
       ↓ PR merge
  mainブランチ
       ↓ push
  GitHub Actions (CD)
    - テスト実行
    - 本番DBへマイグレーション自動適用
    - GitHub Pagesへデプロイ
```

---

## 6. 残課題

| 課題 | 優先度 | 対応方針 |
|---|---|---|
| stagingテストユーザーの作成 | 中 | ユーザー側で対応予定 |
| LINE テスト用チャンネルの設定 | 中 | ユーザー側で対応予定 |
| マイグレーション履歴テーブルの整合（001〜020がCLI管理外） | 低 | `supabase db push` が使えないため `db query -f` で運用継続 |

---

## 7. 教訓

1. **DBマイグレーションとコードは必ずセットでデプロイする** — コードだけ先行してデプロイすると、DBスキーマとの乖離が発生しサービス停止につながる。
2. **開発環境と本番環境のURLを常に意識する** — `.env` のURLがローカル用であっても、CI/CDが別のURLを使っている場合がある。ワークフローのSecretsを定期的に確認する。
3. **スキーマキャッシュエラーは「カラムが存在しない」サインである** — PostgRESTのスキーマキャッシュエラーが出た場合、まずDBのカラム存在確認と接続先プロジェクトの確認を最初に行う。
