// Único lugar que libera ou revoga o acesso. Deploy com --no-verify-jwt: quem autentica é a assinatura da Stripe.
import Stripe from 'npm:stripe@23'
import { admin, stripe, STRIPE_LIVE, stripeSecret } from '../_shared/clients.ts'
import { idOf, OPEN_STATUSES, subscriptionOfInvoice, subscriptionRow } from '../_shared/subscription.ts'

const WEBHOOK_SECRET = stripeSecret('WEBHOOK_SECRET')!
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
  // Evento do outro modo (ex.: teste chegando com a chave live) nunca mexe no acesso.
  if (event.livemode !== STRIPE_LIVE) return new Response('ignored: other mode', { status: 200 })

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
      if (s.mode === 'subscription') {
        const id = idOf(s.subscription)
        return id ? syncSubscription(id) : undefined
      }
      // Compra única antiga. Método assíncrono (ex.: boleto) chega como "unpaid": fica pendente até async_payment_succeeded.
      const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required'
      return saveSession(s, paid ? 'paid' : 'pending')
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return syncSubscription(event.data.object.id)
    case 'invoice.paid':
    case 'invoice.payment_failed':
      // Busca de novo: o evento vem na versão de API do endpoint, e nas antigas a fatura não traz `parent`.
      return handleInvoice(event.type, await stripe.invoices.retrieve(event.data.object.id))
    case 'checkout.session.async_payment_succeeded':
      return saveLegacySession(event.data.object, 'paid')
    case 'checkout.session.async_payment_failed':
      return saveLegacySession(event.data.object, 'failed')
    case 'checkout.session.expired':
      return saveLegacySession(event.data.object, 'expired')
    case 'charge.refunded': {
      const charge = event.data.object
      if (!charge.refunded) return // reembolso parcial não mexe no acesso
      await setByPaymentIntent(idOf(charge.payment_intent), 'refunded')
      return cancelSubscriptionOfPayment(idOf(charge.payment_intent))
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object
      const paymentIntent = idOf(dispute.payment_intent) ??
        idOf((await stripe.charges.retrieve(idOf(dispute.charge)!)).payment_intent)
      await setByPaymentIntent(paymentIntent, 'disputed')
      return cancelSubscriptionOfPayment(paymentIntent)
    }
  }
}

/**
 * Grava a assinatura como ela está agora na Stripe, em vez de usar a cópia do evento:
 * eventos chegam fora de ordem, e assim o último a chegar nunca deixa um status velho.
 * A conta vem do Customer. Na conta de teste compartilhada há assinaturas de outros apps: essas são ignoradas.
 */
async function syncSubscription(id: string) {
  const row = subscriptionRow(await stripe.subscriptions.retrieve(id))
  const [{ data: known }, { data: profile }] = await Promise.all([
    admin.from('subscriptions').select('status').eq('stripe_subscription_id', id).maybeSingle(),
    admin.from('profiles').select('id').eq('stripe_customer_id', row.stripe_customer_id).maybeSingle(),
  ])
  if (!known && !profile) return

  // Sem profile é conta excluída: a linha fica anonimizada, como as compras.
  const statusChanged = await saveSubscription({ ...row, user_id: profile?.id ?? null })

  if (profile && statusChanged) {
    await admin.from('events').insert({
      user_id: profile.id, name: `subscription_${row.status}`, props: { plan: row.plan, from: known?.status ?? null },
    })
  }
}

/**
 * Grava a linha e diz se o status mudou. A Stripe manda vários eventos ao mesmo tempo, então quem decide é o banco:
 * só uma das escritas concorrentes cria a linha ou troca o status, e só ela registra a mudança.
 */
async function saveSubscription(values: ReturnType<typeof subscriptionRow> & { user_id: string | null }) {
  const id = values.stripe_subscription_id
  const created = await admin.from('subscriptions')
    .upsert(values, { ignoreDuplicates: true }).select('stripe_subscription_id')
  if (created.error) throw created.error
  if (created.data?.length) return true

  const changed = await admin.from('subscriptions').update(values)
    .eq('stripe_subscription_id', id).neq('status', values.status).select('stripe_subscription_id')
  if (changed.error) throw changed.error
  if (changed.data?.length) return true

  const { error } = await admin.from('subscriptions').update(values).eq('stripe_subscription_id', id)
  if (error) throw error
  return false
}

async function handleInvoice(type: 'invoice.paid' | 'invoice.payment_failed', invoice: Stripe.Invoice) {
  const id = subscriptionOfInvoice(invoice)
  if (!id) return
  await syncSubscription(id)
  if (type === 'invoice.paid' && invoice.amount_paid === 0) return // fatura de R$ 0 que abre o teste grátis
  const { data: sub } = await admin
    .from('subscriptions').select('user_id, plan').eq('stripe_subscription_id', id).maybeSingle()
  if (sub?.user_id) {
    await admin.from('events').insert({ user_id: sub.user_id, name: type.replace('.', '_'), props: { plan: sub.plan } })
  }
}

/** Reembolso total ou contestação encerra a assinatura na hora, senão ela seguiria cobrando e liberando acesso. */
async function cancelSubscriptionOfPayment(paymentIntent: string | null) {
  if (!paymentIntent) return
  const payments = stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentIntent }, status: 'paid',
  })
  for await (const payment of payments) {
    const id = subscriptionOfInvoice(await stripe.invoices.retrieve(idOf(payment.invoice)!))
    if (!id) continue
    const { data: sub } = await admin
      .from('subscriptions').select('status').eq('stripe_subscription_id', id).maybeSingle()
    if (!sub || !(OPEN_STATUSES as string[]).includes(sub.status)) continue
    await stripe.subscriptions.cancel(id)
    await syncSubscription(id)
  }
}

/** Eventos do Checkout que só importam para a compra única: sessão de assinatura não vira compra. */
function saveLegacySession(s: Stripe.Checkout.Session, status: Status) {
  return s.mode === 'payment' ? saveSession(s, status) : undefined
}

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
