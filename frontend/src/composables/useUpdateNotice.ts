/**
 * アップデート告知の既読管理
 *
 * - localStorage に最後に確認したバージョンを保存
 * - 最新バージョンと比較して未読があるかを判定
 */

import { ref, computed } from 'vue'
import { CHANGELOG } from '@/data/changelog'

/** localStorage キー（yakitori_ プレフィックス踏襲） */
const STORAGE_KEY = 'yakitori_last_seen_version'

export function useUpdateNotice() {
  /**
   * 最後に確認したバージョン（localStorage から復元）
   * null = 一度も確認していない
   */
  const lastSeenVersion = ref<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null,
  )

  /** 最新のアップデートエントリ（配列の先頭） */
  const latestEntry = computed(() => CHANGELOG[0])

  /**
   * 未読アップデートがあるか
   * - 一度も見ていない（lastSeenVersion === null）
   * - または最新バージョンと一致しない
   *
   * NOTE: 現在は「最新1件を見たか」のみ判定。
   * 将来、複数の未読を数えたい場合は以下のように拡張可能：
   * - lastSeenVersion 以降のエントリをフィルタして件数を返す
   * - CHANGELOG.filter(e => e.version > lastSeenVersion).length
   */
  const hasUnreadUpdate = computed(
    () => !lastSeenVersion.value || lastSeenVersion.value !== latestEntry.value.version,
  )

  /**
   * 最新バージョンを既読としてマークする
   * localStorage に保存し、未読バッジを消す
   */
  function markAsRead() {
    const version = latestEntry.value.version
    lastSeenVersion.value = version
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, version)
    }
  }

  return {
    /** 全アップデート履歴（新しい順） */
    changelog: CHANGELOG,
    /** 最新のアップデートエントリ */
    latestEntry,
    /** 未読アップデートがあるか */
    hasUnreadUpdate,
    /** 最新バージョンを既読にする */
    markAsRead,
  }
}
