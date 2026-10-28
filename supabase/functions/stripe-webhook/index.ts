// Único lugar que libera ou revoga o acesso. Deploy com --no-verify-jwt: quem autentica é a assinatura da Stripe.
import Stripe from 'npm:stripe@23'
import { admin, stripe } from '../_shared/clients.ts'

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const cryptoProvider = Stripe.createSubtleCryptoProvider()

type Status = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'disputed'

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const raw = await req.text() // corpo bruto: a assinatura é calculada sobre ele
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature ?? '', WEBHOOK_SECRET, undefined, cryptoProvider)
  } catch {
    return new Response('invalid signature', { status: 400 })
  }

  // Idempotência: o primeiro a gravar o evento processa; repetições respondem 200 sem fazer nada.
  const { error: dup } = await admin.from('stripe_events').insert({ id: event.id, type: event.type })
  if (dup) return new Response(dup.code === '23505' ? 'duplicate' : 'db error', { status: dup.code === '23505' ? 200 : 500 })

  try {
    await handle(event)
  } catch (e) {
    console.error(event.type, event.id, e)
    await admin.from('stripe_events').delete().eq('id', event.id) // deixa a Stripe tentar de novo
    return new Response('error', { status: 500 })
  }
  return new Response('ok', { status: 200 })
})

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object
      // Método assíncrono (ex.: boleto) chega como "unpaid": fica pendente até async_payment_succeeded.
      const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required'
      return saveSession(s, paid ? 'paid' : 'pending')
    }
    case 'checkout.session.async_payment_succeeded':
      return saveSession(event.data.object, 'paid')
    case 'checkout.session.async_payment_failed':
      return saveSession(event.data.object, 'failed')
    case 'checkout.session.expired':
      return saveSession(event.data.object, 'expired')
    case 'charge.refunded': {
      const charge = event.data.object
      if (charge.refunded) await setByPaymentIntent(idOf(charge.payment_intent), 'refunded')
      return
    }
    case 'charge.dispute.created':
      return setByPaymentIntent(idOf(event.data.object.payment_intent), 'disputed')
  }
}

const idOf = (v: string | { id: string } | null) => (typeof v === 'string' ? v : v?.id ?? null)

/** Atualiza (ou cria) a compra da sessão. O usuário vem do client_reference_id, nunca do e-mail. */
async function saveSession(s: Stripe.Checkout.Session, status: Status) {
  const userId = s.client_reference_id ?? s.metadata?.user_id
  if (!userId) return // sessão que não foi criada pelo create-checkout: não é do app
  const paymentIntent = idOf(s.payment_intent)

  let receiptUrl: string | null = null
  if (status === 'paid' && paymentIntent) {
    const charges = await stripe.charges.list({ payment_intent: paymentIntent, limit: 1 })
    receiptUrl = charges.data[0]?.receipt_url ?? null
  }
  const promotionCode = s.discounts?.map((d) => idOf(d.promotion_code)).find(Boolean) ?? null

  // Não volta uma compra já paga para pendente/expirada (eventos podem chegar fora de ordem).
  const { data: current } = await admin
    .from('purchases').select('status').eq('stripe_checkout_session_id', s.id).maybeSingle()
  if (current && ['paid', 'refunded', 'disputed'].includes(current.status) && status !== 'paid') return

  const { error } = await admin.from('purchases').upsert({
    user_id: userId,
    stripe_checkout_session_id: s.id,
    stripe_payment_intent_id: paymentIntent,
    stripe_customer_id: idOf(s.customer),
    amount: s.amount_total,
    currency: s.currency ?? 'brl',
    status,
    receipt_url: receiptUrl,
    promotion_code: promotionCode,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_checkout_session_id' })
  if (error) throw error

  if (status === 'paid' && current?.status !== 'paid') {
    await admin.from('events').insert({ user_id: userId, name: 'access_granted', props: { promotion_code: promotionCode } })
  }
}

async function setByPaymentIntent(paymentIntent: string | null, status: 'refunded' | 'disputed') {
  if (!paymentIntent) return
  const { data, error } = await admin
    .from('purchases').update({ status, updated_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntent).select('user_id')
  if (error) throw error
  if (status === 'refunded') {
    for (const p of data ?? []) await admin.from('events').insert({ user_id: p.user_id, name: 'refund', props: null })
  }
}
