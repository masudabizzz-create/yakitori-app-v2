/**
 * Vitest セットアップ
 * jsdom 環境で localStorage がグローバル公開されないケースに備えた polyfill。
 * 本番（ブラウザ）では実 localStorage が使われるため、テスト時のみ有効。
 */

class LocalStorageMock {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new LocalStorageMock() as unknown as Storage
}
