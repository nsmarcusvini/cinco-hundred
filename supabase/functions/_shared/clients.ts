import Stripe from 'npm:stripe@23'
import { isGoneCustomer, isLiveKey } from './mode.ts'

export { admin, cors, json } from './supabase.ts'

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!

export const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2026-10-28.endive' })

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
