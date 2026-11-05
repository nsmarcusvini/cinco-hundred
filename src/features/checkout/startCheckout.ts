import { toast } from '../../components/Toast'
import { track } from '../../lib/analytics'
import { getPending } from '../../lib/pending'
import type { PlanId } from '../../lib/plans'
import { supabase } from '../../lib/supabase'

/** Leva para o portal do cliente da Stripe. Retorna false se não conseguiu abrir. */
export async function openPortal(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('create-portal')
  if (error || !data?.url) {
    toast('Não foi possível abrir sua assinatura agora. Tente de novo em instantes.', 'error')
    return false
  }
  location.assign(data.url)
  return true
}

/**
 * Leva direto para o Checkout hospedado da Stripe (sem telas intermediárias).
 * Retorna 'already' se a conta já tem acesso; senão a página sai do app.
 * Quem já tem assinatura (ex.: cartão recusado) vai para o portal, para não pagar duas vezes.
 */
export async function startCheckout(from: string, plan: PlanId): Promise<'already' | 'error' | 'redirecting'> {
  track('checkout_started', { from, plan })
  const pending = getPending()
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: {
      plan,
      ...(pending?.kind === 'invite' ? { invite_code: pending.code } : pending?.kind === 'movement' ? { movement_slug: pending.slug } : {}),
    },
  })
  if (error || !(data?.url || data?.already_has_access || data?.manage)) {
    toast('Não foi possível abrir o pagamento agora. Tente de novo em instantes.', 'error')
    return 'error'
  }
  if (data.already_has_access) return 'already'
  if (data.manage) return (await openPortal()) ? 'redirecting' : 'error'
  location.assign(data.url)
  return 'redirecting'
}
