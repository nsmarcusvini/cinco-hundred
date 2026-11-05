import type Stripe from 'npm:stripe@23'
import { describe, expect, it } from 'vitest'
import { subscriptionOfInvoice, subscriptionRow } from './subscription'

const PERIOD_END = 1_800_000_000
const periodEndIso = new Date(PERIOD_END * 1000).toISOString()

function sub(overrides: Record<string, unknown> = {}, interval = 'month') {
  return {
    id: 'sub_1', customer: 'cus_1', status: 'trialing', trial_end: null, cancel_at: null, cancel_at_period_end: false,
    items: { data: [{ current_period_end: PERIOD_END, price: { id: 'price_1', recurring: { interval } } }] },
    ...overrides,
  } as unknown as Stripe.Subscription
}

describe('subscriptionRow', () => {
  it('copia os campos da Stripe', () => {
    expect(subscriptionRow(sub({ trial_end: PERIOD_END }))).toMatchObject({
      stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1', stripe_price_id: 'price_1',
      plan: 'monthly', status: 'trialing', trial_end: periodEndIso, current_period_end: periodEndIso, cancel_at: null,
    })
  })
  it('deduz o plano do intervalo do preço, que muda quando a pessoa troca no portal', () => {
    expect(subscriptionRow(sub({}, 'year')).plan).toBe('annual')
    expect(subscriptionRow(sub({}, 'week')).plan).toBeNull()
  })
  it('aceita Customer expandido', () => {
    expect(subscriptionRow(sub({ customer: { id: 'cus_2' } })).stripe_customer_id).toBe('cus_2')
  })
  it('cancelamento no fim do período usa a data do fim do período', () => {
    expect(subscriptionRow(sub({ cancel_at_period_end: true })).cancel_at).toBe(periodEndIso)
  })
  it('cancelamento agendado usa a data pedida', () => {
    expect(subscriptionRow(sub({ cancel_at: PERIOD_END + 60 })).cancel_at).toBe(new Date((PERIOD_END + 60) * 1000).toISOString())
  })
})

describe('subscriptionOfInvoice', () => {
  it('lê a assinatura pelo parent da fatura', () => {
    const invoice = { parent: { subscription_details: { subscription: 'sub_1' } } } as unknown as Stripe.Invoice
    expect(subscriptionOfInvoice(invoice)).toBe('sub_1')
  })
  it('fatura avulsa não tem assinatura', () => {
    expect(subscriptionOfInvoice({ parent: null } as unknown as Stripe.Invoice)).toBeNull()
  })
})
