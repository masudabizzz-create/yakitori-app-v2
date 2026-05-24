import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrepResult, LineReportData } from '@/composables/useInventoryCalc'

// Edge Function 呼び出しのために supabase.functions.invoke をモックする
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

// vi.mock の後で import する（モックが反映された supabase が読み込まれる）
import { sendLineBroadcast, notifyDailyReport } from '@/composables/useLineNotify'
import { supabase } from '@/lib/supabase'

const invokeMock = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>

// ============================================================
// テストフィクスチャ
// ============================================================

const report: LineReportData = {
  totalSales: 98000,
  drinkRatio: 35,
  courseCasual: 2,
  courseStandard: 3,
  coursePremium: 1,
  extraSkewers: 5,
  totalSkewers: 110,
  memo: '',
}

const prepResults: PrepResult[] = [
  { skewerId: 's1', name: 'もも', category: 'レギュラー', stock: 100, prepAmount: 60, bags: 3 },
]

beforeEach(() => {
  invokeMock.mockReset()
})

// ============================================================
// sendLineBroadcast
// ============================================================

describe('sendLineBroadcast', () => {
  it('Edge Function `send-line` に message を渡して invoke する', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null })

    await sendLineBroadcast('テストメッセージ')

    expect(invokeMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledWith('send-line', {
      body: { message: 'テストメッセージ' },
    })
  })

  it('Edge Function がエラーを返したら詳細を含む例外を投げる', async () => {
    // SDK v2: 非2xx 時は data=null, error=FunctionsHttpError(context=Response)
    const mockResponse = new Response(
      JSON.stringify({ error: 'LINE token is not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: mockResponse,
      },
    })

    await expect(sendLineBroadcast('msg')).rejects.toThrow('LINE token is not configured')
  })

  it('ネットワークエラー時は error.message を含む例外を投げる', async () => {
    // FunctionsFetchError は context を持たないため error.message にフォールバックする
    invokeMock.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to fetch' },
    })

    await expect(sendLineBroadcast('msg')).rejects.toThrow('Failed to fetch')
  })
})

// ============================================================
// notifyDailyReport
// ============================================================

describe('notifyDailyReport', () => {
  it('送信成功時 lineSent=true と生成メッセージを返す', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null })

    const res = await notifyDailyReport({ prepResults, report, staffName: '田中' })

    expect(res.lineSent).toBe(true)
    expect(res.lineError).toBe('')
    expect(res.message).toContain('🍢 明日の仕込み')
    expect(res.message).toContain('もも')
  })

  it('送信失敗時 lineSent=false・lineError に詳細を返す（メッセージ自体は生成）', async () => {
    // SDK v2 の実際の挙動に合わせた FunctionsHttpError モック
    const mockResponse = new Response(
      JSON.stringify({ error: 'LINE token is not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: mockResponse,
      },
    })

    const res = await notifyDailyReport({ prepResults, report, staffName: '田中' })

    expect(res.lineSent).toBe(false)
    expect(res.lineError).toContain('LINE token is not configured')
    expect(res.message).toContain('🍢 明日の仕込み')
  })
})
