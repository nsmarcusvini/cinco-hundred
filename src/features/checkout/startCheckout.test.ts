import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.fn()
const invoke = vi.fn()
vi.mock('../../components/Toast', () => ({ toast: (...a: unknown[]) => toast(...a) }))
vi.mock('../../lib/analytics', () => ({ track: () => {} }))
vi.mock('../../lib/pending', () => ({ getPending: () => null }))
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

const { startCheckout } = await import('./startCheckout')
const httpError = (status: number, code?: string) => Object.assign(new Error(`HTTP ${status}`), { status, code })

describe('startCheckout', () => {
  beforeEach(() => { toast.mockReset(); invoke.mockReset() })

  it('assinaturas fechadas de propósito: aviso informativo, não erro', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(503, 'checkout_disabled') })
    expect(await startCheckout('acesso', 'monthly')).toBe('unavailable')
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('ainda não estão abertas'))
  })

  it('falha real continua como erro para tentar de novo', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(500, 'db_error') })
    expect(await startCheckout('acesso', 'monthly')).toBe('error')
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Tente de novo'), 'error')
  })
})
