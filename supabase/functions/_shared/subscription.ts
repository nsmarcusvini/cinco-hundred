import type Stripe from 'npm:stripe@23'

/** Assinaturas que ainda existem na Stripe: não abrir outra por cima (cobraria duas vezes). */
export const OPEN_STATUSES: Stripe.Subscription.Status[] = ['trialing', 'active', 'past_due', 'unpaid', 'paused']

export const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null)

const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null)

/** Linha de public.subscriptions. O user_id entra à parte: vem do Customer, não da assinatura. */
export function subscriptionRow(sub: Stripe.Subscription) {
  const item = sub.items.data[0]
  const interval = item?.price.recurring?.interval
  const periodEnd = item?.current_period_end
  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: idOf(sub.customer)!,
    stripe_price_id: item?.price.id ?? null,
    plan: interval === 'year' ? 'annual' : interval === 'month' ? 'monthly' : null,
    status: sub.status as string,
    trial_end: iso(sub.trial_end),
    current_period_end: iso(periodEnd),
    cancel_at: iso(sub.cancel_at ?? (sub.cancel_at_period_end ? periodEnd : null)),
    updated_at: new Date().toISOString(),
  }
}

/** Assinatura da fatura, ou null se a fatura não veio de uma assinatura. */
export function subscriptionOfInvoice(invoice: Stripe.Invoice) {
  return idOf(invoice.parent?.subscription_details?.subscription)
}
