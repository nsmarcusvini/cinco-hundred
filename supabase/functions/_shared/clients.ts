import Stripe from 'npm:stripe@23'
import { isGoneCustomer, isLiveKey, stripeEnv } from './mode.ts'

export { admin, cors, json } from './supabase.ts'

/** Secret da Stripe do modo ativo (STRIPE_MODE): STRIPE_<nome> no teste, STRIPE_LIVE_<nome> no live. */
export const stripeSecret = (name: string) => stripeEnv((n) => Deno.env.get(n), name)

const STRIPE_KEY = stripeSecret('SECRET_KEY')
// STRIPE_MODE=live com chave de teste (ou sem chave) não sobe: nunca misturar os modos.
if (Deno.env.get('STRIPE_MODE') === 'live' && !isLiveKey(STRIPE_KEY)) throw new Error('STRIPE_MODE=live exige chave live')

export const stripe = new Stripe(STRIPE_KEY!, { apiVersion: '2026-10-28.endive' })

/** true quando a chave configurada é do modo live. */
export const STRIPE_LIVE = isLiveKey(STRIPE_KEY)

/** Customer do perfil, se existir neste modo. Um id criado no teste não existe no live (e vice-versa). */
export async function customerInThisMode(id: string | null | undefined) {
  if (!id) return null
  try {
    return isGoneCustomer(await stripe.customers.retrieve(id)) ? null : id
  } catch (e) {
    if (isGoneCustomer(null, e)) return null
    throw e
  }
}
