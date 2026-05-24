import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'yakitori_theme'

/**
 * テーマストア（light / dark / system）
 * - 既定は system（iPhone のシステム設定に追従）
 * - 選択は localStorage に保存
 * - <html> の class="dark" を付け外しして切り替える
 */
export const useThemeStore = defineStore('theme', () => {
  const stored =
    typeof localStorage !== 'undefined'
      ? (localStorage.getItem(STORAGE_KEY) as ThemeMode | null)
      : null
  const mode = ref<ThemeMode>(stored ?? 'system')

  function applyTheme(): void {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = mode.value === 'dark' || (mode.value === 'system' && prefersDark)
    document.documentElement.classList.toggle('dark', isDark)
  }

  function setMode(m: ThemeMode): void {
    mode.value = m
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      // 保存失敗は無視
    }
    applyTheme()
  }

  /** system → light → dark → system と循環する */
  function cycle(): void {
    setMode(mode.value === 'system' ? 'light' : mode.value === 'light' ? 'dark' : 'system')
  }

  // システム設定の変更に追従
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
  applyTheme()

  return { mode, setMode, cycle }
})
