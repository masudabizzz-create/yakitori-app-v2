<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { AuditLog } from '@/types'

const logs = ref<AuditLog[]>([])
const loading = ref(false)
const loadErr = ref('')

const PAGE_SIZE = 50
const page = ref(0)
const hasMore = ref(true)

onMounted(() => fetchLogs(true))

async function fetchLogs(reset = false) {
  if (reset) {
    page.value = 0
    logs.value = []
    hasMore.value = true
  }
  loading.value = true
  loadErr.value = ''
  try {
    const from = page.value * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as AuditLog[]
    logs.value = reset ? rows : [...logs.value, ...rows]
    hasMore.value = rows.length === PAGE_SIZE
    if (!reset) page.value++
  } catch (e) {
    loadErr.value = e instanceof Error ? e.message : '読み込みに失敗しました'
  } finally {
    loading.value = false
  }
}

function loadMore() {
  page.value++
  fetchLogs(false)
}

/** action ラベルを日本語化 */
function actionLabel(action: string): string {
  const MAP: Record<string, string> = {
    'auth.logout':           'ログアウト',
    'user.deactivate':       'ユーザー無効化',
    'user.role_change':      'ロール変更',
    'user.delete':           'ユーザー削除',
    'user.register':         'ユーザー登録',
    'permission.grant':      '権限付与',
    'permission.revoke':     '権限削除',
    'settings.update':       '設定更新',
    'tenant.create':         '店舗作成',
    'tenant.delete':         '店舗削除',
    'invitation.create_qr':  'QR招待発行',
  }
  return MAP[action] ?? action
}

/** action に応じたバッジ色 */
function actionClass(action: string): string {
  if (action.includes('delete') || action.includes('deactivate')) {
    return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
  }
  if (action.includes('create') || action.includes('register') || action.includes('grant')) {
    return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  }
  if (action.includes('revoke') || action.includes('role_change')) {
    return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
  }
  return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div class="space-y-3">
    <!-- ヘッダー -->
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">監査ログ（直近 {{ logs.length }} 件）</h2>
      <button
        type="button"
        class="text-xs text-brand-500 hover:underline"
        @click="fetchLogs(true)"
      >
        🔄 更新
      </button>
    </div>

    <p v-if="loadErr" class="text-sm text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
      {{ loadErr }}
    </p>

    <p v-if="loading && logs.length === 0" class="text-center text-sm text-neutral-400 dark:text-neutral-500 py-8">
      読み込み中...
    </p>

    <p v-else-if="!loading && logs.length === 0" class="text-center text-sm text-neutral-400 dark:text-neutral-500 py-8">
      監査ログはまだありません
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="log in logs"
        :key="log.id"
        class="bg-card dark:bg-card-dark border border-edge dark:border-edge-dark rounded-xl px-4 py-3 space-y-1"
      >
        <!-- 1行目: 日時 + アクション -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">
            {{ formatDate(log.created_at) }}
          </span>
          <span
            class="text-xs font-semibold px-2 py-0.5 rounded-full"
            :class="actionClass(log.action)"
          >
            {{ actionLabel(log.action) }}
          </span>
          <span v-if="log.actor_name" class="text-xs text-neutral-600 dark:text-neutral-300">
            {{ log.actor_name }}
          </span>
        </div>

        <!-- 2行目: 対象 -->
        <p v-if="log.target_name || log.target_id" class="text-xs text-neutral-500 dark:text-neutral-400">
          対象: {{ log.target_name ?? log.target_id }}
          <span v-if="log.target_type" class="opacity-60">（{{ log.target_type }}）</span>
        </p>

        <!-- 変更前後（ロール変更など） -->
        <p v-if="log.before_value || log.after_value" class="text-xs text-neutral-400 dark:text-neutral-500 font-mono truncate">
          <span v-if="log.before_value">{{ JSON.stringify(log.before_value) }}</span>
          <span v-if="log.before_value && log.after_value"> → </span>
          <span v-if="log.after_value">{{ JSON.stringify(log.after_value) }}</span>
        </p>
      </li>
    </ul>

    <!-- さらに読み込む -->
    <div v-if="hasMore && !loading" class="text-center pt-2">
      <button
        type="button"
        class="text-sm text-brand-500 hover:underline"
        @click="loadMore"
      >
        さらに読み込む
      </button>
    </div>

    <p v-if="loading && logs.length > 0" class="text-center text-xs text-neutral-400 dark:text-neutral-500 py-2">
      読み込み中...
    </p>
  </div>
</template>
