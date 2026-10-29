import type { QueryClient } from '@tanstack/react-query'
import { toast } from '../../components/Toast'
import { supabase } from '../../lib/supabase'

export interface MarkVars { challengeId: string; userId: string; blocks: number[]; via: 'tap' | 'amount' | 'draw' }
export interface UnmarkVars { challengeId: string; userId: string; block: number }

/**
 * Funções de marcar/desmarcar registradas no QueryClient (e não só no hook) para que uma marcação feita
 * sem internet, guardada no IndexedDB, consiga ser enviada depois mesmo que a página tenha sido recarregada.
 * Os callbacks do hook (otimista, toasts) sobrescrevem estes enquanto a tela está aberta.
 */
export function registerBlockMutations(qc: QueryClient) {
  const refresh = (challengeId: string, userId: string) => {
    qc.invalidateQueries({ queryKey: ['challenge', challengeId] })
    qc.invalidateQueries({ queryKey: ['challenges', userId] })
    qc.invalidateQueries({ queryKey: ['saved-by-month', userId] })
    qc.invalidateQueries({ queryKey: ['my-marks', userId] })
  }

  qc.setMutationDefaults(['mark'], {
    retry: 2,
    mutationFn: async ({ challengeId, userId, blocks }: MarkVars) => {
      const { error } = await supabase
        .from('block_marks')
        .insert(blocks.map((block) => ({ challenge_id: challengeId, block, user_id: userId })))
      if (error) throw error
    },
    onError: (error: { code?: string }) =>
      error.code !== '23505' && toast('Uma marcação feita sem internet não foi salva. Confira a grade.', 'error'),
    onSettled: (_d, _e, v: MarkVars) => refresh(v.challengeId, v.userId),
  })

  qc.setMutationDefaults(['unmark'], {
    retry: 2,
    mutationFn: async ({ challengeId, userId, block }: UnmarkVars) => {
      const { error, count } = await supabase
        .from('block_marks').delete({ count: 'exact' })
        .eq('challenge_id', challengeId).eq('block', block).eq('user_id', userId)
      if (error || count === 0) throw error ?? new Error('not deleted')
    },
    onSettled: (_d, _e, v: UnmarkVars) => refresh(v.challengeId, v.userId),
  })
}
