/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

// japanese-holidays は型定義を同梱しないため最小限の宣言を補う
declare module 'japanese-holidays' {
  /** 祝日なら祝日名、そうでなければ undefined を返す（furikae=true で振替休日を含む） */
  export function isHoliday(date: Date, furikae?: boolean): string | undefined
}
