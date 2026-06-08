/**
 * アップデート履歴
 *
 * 配列の先頭が最新エントリ。新しいアップデートを追加する場合は先頭に追記する。
 */

export interface ChangelogEntry {
  /** バージョン番号（例: "v2.1.0"） */
  version: string
  /** リリース日（YYYY-MM-DD） */
  date: string
  /** アップデートのタイトル */
  title: string
  /** 変更内容（箇条書き） */
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v2.1.0',
    date: '2026-06-08',
    title: '分析画面リデザイン',
    changes: [
      '5つの期間スコープ（単日・週・月・四半期・年）に対応',
      '前期比較ページで詳細な増減分析が可能に',
      '実入力客数・客単価の集計を追加',
      '売上推移グラフに目盛り・Y軸ラベルを追加',
      '期間ナビゲーション（矢印・カレンダーピッカー）を実装',
      '曜日ズレ問題を修正（Asia/Tokyo基準に統一）',
    ],
  },
  // 今後のアップデートはここに追記（新しいものを先頭に）
]
