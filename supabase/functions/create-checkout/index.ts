// Cria a Checkout Session do acesso vitalício. Exige o JWT do usuário logado.
// Não libera nada: quem libera é o stripe-webhook.
import { admin, cors, json, stripe } from '../_shared/clients.ts'

const APP_URL = Deno.env.get('APP_URL')!
const PRICE_ID = Deno.env.get('STRIPE_PRICE_ID')!

const shortText = (v: unknown, max: number) =>
  typeof v === 'string' && /^[\w-]+$/.test(v) ? v.slice(0, max) : undefined

function randomLetters(n: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  return Array.from(bytes, (b) => String.fromCharCode(97 + (b % 26))).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user?.email) return json({ error: 'unauthorized' }, 401)

  const { data: profile } = await admin.from('profiles').select('has_access').eq('id', user.id).single()
  if (profile?.has_access) return json({ already_has_access: true })

  const body = await req.json().catch(() => ({}))
  const inviteCode = shortText(body.invite_code, 12)
  const movementSlug = shortText(body.movement_slug, 60)

  // Reaproveita o Customer: primeiro o da última compra, depois pelo e-mail da conta.
  const { data: prev } = await admin
    .from('purchases').select('stripe_customer_id').eq('user_id', user.id)
    .not('stripe_customer_id', 'is', null).limit(1).maybeSingle()
  let customer = prev?.stripe_customer_id as string | undefined
  if (!customer) {
    const found = await stripe.customers.list({ email: user.email, limit: 1 })
    customer = found.data[0]?.id ??
      (await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } })).id
  }

  const metadata: Record<string, string> = { user_id: user.id }
  if (inviteCode) metadata.invite_code = inviteCode
  if (movementSlug) metadata.movement_slug = movementSlug

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    client_reference_id: user.id,
    metadata,
    customer,
    locale: 'pt-BR',
    allow_promotion_codes: true,
    success_url: `${APP_URL}/app/bem-vindo?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/app/acesso?cancelado=1`,
    integration_identifier: `cinco-hundred-vitalicio-${randomLetters(8)}`,
  })

  const { error } = await admin.from('purchases').insert({
    user_id: user.id,
    stripe_checkout_session_id: session.id,
    stripe_customer_id: customer,
    amount: session.amount_total,
    currency: session.currency ?? 'brl',
    status: 'pending',
  })
  if (error) return json({ error: 'db_error' }, 500)

  return json({ url: session.url })
})
