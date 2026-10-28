import { toast } from '../../components/Toast'
import { track } from '../../lib/analytics'
import { getPending } from '../../lib/pending'
import { supabase } from '../../lib/supabase'

/**
 * Leva direto para o Checkout hospedado da Stripe (sem telas intermediárias).
 * Retorna 'already' se a conta já tem acesso; senão a página sai do app.
 */
export async function startCheckout(from: string): Promise<'already' | 'error' | 'redirecting'> {
  track('checkout_started', { from })
  const pending = getPending()
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: pending?.kind === 'invite' ? { invite_code: pending.code } : pending?.kind === 'movement' ? { movement_slug: pending.slug } : {},
  })
  if (error || !(data?.url || data?.already_has_access)) {
    toast('Não foi possível abrir o pagamento agora. Tente de novo em instantes.', 'error')
    return 'error'
  }
  if (data.already_has_access) return 'already'
  location.assign(data.url)
  return 'redirecting'
}
