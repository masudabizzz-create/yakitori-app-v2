import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'yakitori_theme'
const DEFAULT_BRAND_HEX = '#FF6B35'

// ─── テナントテーマカラー ───────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

let _prevBrandHex: string | undefined

/**
 * テナントのテーマカラー（hex）を CSS 変数に適用する。
 * 色が変わったときのみ 0.3s トランジションを付ける。
 */
export function applyTenantColor(hex: string | null | undefined): void {
  if (typeof document === 'undefined') return
  const target = hex || DEFAULT_BRAND_HEX
  const base = hexToRgb(target) ?? hexToRgb(DEFAULT_BRAND_HEX)!
  const white: [number, number, number] = [255, 255, 255]
  const black: [number, number, number] = [0, 0, 0]

  const shades: [string, [number, number, number]][] = [
    ['50',  lerpRgb(base, white, 0.92)],
    ['100', lerpRgb(base, white, 0.78)],
    ['400', lerpRgb(base, white, 0.20)],
    ['500', base],
    ['600', lerpRgb(base, black, 0.10)],
    ['700', lerpRgb(base, black, 0.28)],
  ]

  const root = document.documentElement
  if (_prevBrandHex !== undefined && _prevBrandHex !== target) {
    root.classList.add('brand-transitioning')
    setTimeout(() => root.classList.remove('brand-transitioning'), 400)
  }
  _prevBrandHex = target

  for (const [shade, [r, g, b]] of shades) {
    root.style.setProperty(`--color-brand-${shade}`, `${r} ${g} ${b}`)
  }
}

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
