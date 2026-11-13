// Cria a Checkout Session da assinatura. Exige o JWT do usuário logado.
// Não libera nada: quem libera é o stripe-webhook.
import { admin, cors, customerInThisMode, json, stripe, STRIPE_LIVE } from '../_shared/clients.ts'
import { checkoutOpen } from '../_shared/mode.ts'
import { OPEN_STATUSES } from '../_shared/subscription.ts'

const APP_URL = Deno.env.get('APP_URL')!
const PRICES = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'),
  annual: Deno.env.get('STRIPE_PRICE_ANNUAL'),
}
const TRIAL_DAYS = 3 // só no mensal e só na primeira assinatura
const OPEN = checkoutOpen(STRIPE_LIVE, Deno.env.get('CHECKOUT_ENABLED'))
const PLAN_NAMES = { monthly: 'Tijoblock, plano mensal', annual: 'Tijoblock, plano anual' }

// Identidade do Tijoblock só nesta sessão: a conta da Stripe é compartilhada com outros apps.
const BRANDING = {
  display_name: 'Tijoblock',
  background_color: '#f4f1e8',
  button_color: '#0b3d2e',
  border_style: 'rounded' as const,
  icon: { type: 'url' as const, url: `${APP_URL}/pwa-512x512.png` },
}

const shortText = (v: unknown, max: number) =>
  typeof v === 'string' && /^[\w-]+$/.test(v) ? v.slice(0, max) : undefined

function randomLetters(n: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  return Array.from(bytes, (b) => String.fromCharCode(97 + (b % 26))).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!OPEN) return json({ error: 'checkout_disabled' }, 503) // live configurado, cobrança ainda não liberada

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user?.email) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const plan: unknown = body.plan
  if (plan !== 'monthly' && plan !== 'annual') return json({ error: 'invalid_plan' }, 400)
  const price = PRICES[plan]
  if (!price) return json({ error: 'plan_not_configured' }, 500)

  const { data: profile } = await admin
    .from('profiles').select('has_access, stripe_customer_id').eq('id', user.id).single()
  if (profile?.has_access) return json({ already_has_access: true })

  // Sempre o Customer da própria conta. Não buscamos por e-mail: o cadastro não confirma o e-mail,
  // e reaproveitar o Customer de outra pessoa daria acesso ao portal dela.
  // Um Customer do modo teste não existe no live: a conta ganha um novo, e o antigo fica de lado.
  const stale = profile?.stripe_customer_id as string | undefined
  let customer = (await customerInThisMode(stale)) ?? undefined
  if (!customer) {
    customer = (await stripe.customers.create(
      { email: user.email, metadata: { user_id: user.id } },
      { idempotencyKey: stale ? `customer-${user.id}-${stale}` : `customer-${user.id}` },
    )).id
    const { error } = await admin.from('profiles').update({ stripe_customer_id: customer }).eq('id', user.id)
    if (error) return json({ error: 'db_error' }, 500)
  }

  // Quem tem assinatura (ex.: cartão recusado) resolve no portal, não abre outra por cima.
  const previous = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 })
  if (previous.data.some((s) => OPEN_STATUSES.includes(s.status))) return json({ manage: true })

  // Dois checkouts abertos virariam duas assinaturas: vale só o último.
  const open = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 10 })
  await Promise.all(open.data.map((s) => stripe.checkout.sessions.expire(s.id)))

  const metadata: Record<string, string> = { user_id: user.id, plan }
  const inviteCode = shortText(body.invite_code, 12)
  const movementSlug = shortText(body.movement_slug, 60)
  if (inviteCode) metadata.invite_code = inviteCode
  if (movementSlug) metadata.movement_slug = movementSlug

  const withTrial = plan === 'monthly' && previous.data.length === 0
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    metadata,
    customer,
    locale: 'pt-BR',
    allow_promotion_codes: true,
    payment_method_collection: 'always', // o teste grátis exige cartão
    branding_settings: BRANDING,
    subscription_data: {
      description: PLAN_NAMES[plan],
      metadata: { user_id: user.id },
      ...(withTrial && {
        trial_period_days: TRIAL_DAYS,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
      }),
    },
    success_url: `${APP_URL}/app/bem-vindo?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/app/acesso?cancelado=1`,
    integration_identifier: `tijoblock-assinatura-${randomLetters(8)}`,
  })

  return json({ url: session.url })
})
