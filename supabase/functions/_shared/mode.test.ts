import { describe, expect, it } from 'vitest'
import { checkoutOpen, isGoneCustomer, isLiveKey, stripeEnv } from './mode'

describe('stripeEnv', () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name]
  const both = { STRIPE_SECRET_KEY: 'rk_test_1', STRIPE_LIVE_SECRET_KEY: 'rk_live_1' }
  it('sem STRIPE_MODE usa os secrets do teste', () => {
    expect(stripeEnv(env(both), 'SECRET_KEY')).toBe('rk_test_1')
  })
  it('STRIPE_MODE=live usa os secrets STRIPE_LIVE_*', () => {
    expect(stripeEnv(env({ ...both, STRIPE_MODE: 'live' }), 'SECRET_KEY')).toBe('rk_live_1')
  })
  it('live sem o secret live não cai no do teste', () => {
    expect(stripeEnv(env({ STRIPE_SECRET_KEY: 'rk_test_1', STRIPE_MODE: 'live' }), 'SECRET_KEY')).toBeUndefined()
  })
})

describe('isLiveKey', () => {
  it('reconhece chave secreta e restrita do live', () => {
    expect(isLiveKey('sk_live_abc')).toBe(true)
    expect(isLiveKey('rk_live_abc')).toBe(true)
  })
  it('chave de teste ou ausente não é live', () => {
    expect(isLiveKey('sk_test_abc')).toBe(false)
    expect(isLiveKey('rk_test_abc')).toBe(false)
    expect(isLiveKey(undefined)).toBe(false)
    expect(isLiveKey('pk_live_abc')).toBe(false)
  })
})

describe('checkoutOpen', () => {
  it('live fica fechado até CHECKOUT_ENABLED=true', () => {
    expect(checkoutOpen(true, undefined)).toBe(false)
    expect(checkoutOpen(true, 'false')).toBe(false)
    expect(checkoutOpen(true, '1')).toBe(false)
    expect(checkoutOpen(true, 'true')).toBe(true)
  })
  it('teste segue aberto', () => {
    expect(checkoutOpen(false, undefined)).toBe(true)
  })
})

describe('isGoneCustomer', () => {
  it('Customer apagado ou de outro modo', () => {
    expect(isGoneCustomer({ deleted: true })).toBe(true)
    expect(isGoneCustomer(null, { code: 'resource_missing' })).toBe(true)
  })
  it('Customer válido ou erro de outro tipo', () => {
    expect(isGoneCustomer({})).toBe(false)
    expect(isGoneCustomer(null, { code: 'rate_limit' })).toBe(false)
  })
})
