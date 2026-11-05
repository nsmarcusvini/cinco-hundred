// Abre o portal do cliente da Stripe (cancelar, trocar de plano, atualizar o cartão). Exige o JWT do usuário logado.
import { admin, cors, json, stripe } from '../_shared/clients.ts'

const APP_URL = Deno.env.get('APP_URL')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
  if (!profile?.stripe_customer_id) return json({ error: 'no_customer' }, 404)

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${APP_URL}/app/config`,
    locale: 'pt-BR',
  })
  return json({ url: session.url })
})
