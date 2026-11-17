// Abre o portal do cliente da Stripe (cancelar, trocar de plano, atualizar o cartão). Exige o JWT do usuário logado.
import { admin, cors, customerInThisMode, json, stripe, STRIPE_LIVE, stripeSecret } from '../_shared/clients.ts'

const APP_URL = Deno.env.get('APP_URL')!
// Configuração própria do Tijoloblock: a padrão da conta é compartilhada com outros apps.
const CONFIGURATION = stripeSecret('PORTAL_CONFIGURATION') || undefined

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (STRIPE_LIVE && !CONFIGURATION) return json({ error: 'portal_not_configured' }, 500)

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
  // Customer do modo teste não existe no live: para o portal, é como não ter assinatura.
  const customer = await customerInThisMode(profile?.stripe_customer_id)
  if (!customer) return json({ error: 'no_customer' }, 404)

  const session = await stripe.billingPortal.sessions.create({
    customer,
    configuration: CONFIGURATION,
    return_url: `${APP_URL}/app/config`,
    locale: 'pt-BR',
  })
  return json({ url: session.url })
})
