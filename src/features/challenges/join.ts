import { track } from '../../lib/analytics'
import { clearPending } from '../../lib/pending'
import { supabase } from '../../lib/supabase'

export type JoinResult = { ok: true; id: string } | { ok: false; message: string; needsAccess?: boolean }

/** Entra num desafio pelo código. Mensagens de erro em português vêm do servidor. */
export async function joinByCode(code: string, name: string): Promise<JoinResult> {
  const { data, error } = await supabase.rpc('join_challenge', { p_code: code.trim(), p_name: name.trim() || 'Participante' })
  if (error) {
    if (error.code === '42501') return { ok: false, message: 'Libere seu acesso para entrar no desafio.', needsAccess: true }
    return { ok: false, message: error.message || 'Não foi possível entrar agora. Tente de novo.' }
  }
  if (!data) return { ok: false, message: 'Código não encontrado. Confira as 6 letras e números.' }
  clearPending()
  track('invite_accepted')
  return { ok: true, id: data as string }
}
