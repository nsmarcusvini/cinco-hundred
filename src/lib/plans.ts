// Preços exibidos no app e na landing. Os valores cobrados vêm dos Price IDs da Stripe
// (STRIPE_PRICE_MONTHLY e STRIPE_PRICE_ANNUAL): mudou lá, muda aqui e nos Termos.

export type PlanId = 'monthly' | 'annual'

export const TRIAL_DAYS = 3

export const PLANS: Record<PlanId, { name: string; price: string; period: string; note: string }> = {
  monthly: { name: 'Mensal', price: 'R$ 9,90', period: 'mês', note: `${TRIAL_DAYS} dias grátis, depois R$ 9,90 por mês` },
  annual: { name: 'Anual', price: 'R$ 79', period: 'ano', note: 'Sai por R$ 6,58 por mês, 33% de desconto' },
}
