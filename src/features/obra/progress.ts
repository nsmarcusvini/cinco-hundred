import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { toast } from '../../components/Toast'
import { confetti } from '../../lib/confetti'
import { achievements, obraFor, type Mark } from '../../lib/obra'
import { useActivePlan, useProfile, type Profile } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { useUserId } from '../auth/AuthProvider'
import { useChallenges } from '../challenges/api'

/** Marcações da própria pessoa, em todos os desafios (cada uma é um tijolo da obra). */
export function useMyMarks() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['my-marks', uid],
    queryFn: async () => {
      const { data, error } = await supabase.from('block_marks').select('block, marked_at, challenge_id').eq('user_id', uid)
      if (error) throw error
      return data as Mark[]
    },
  })
}

/** Obra e conquistas calculadas a partir das marcações, dos desafios e do plano. Nulo enquanto carrega. */
export function useProgress() {
  const uid = useUserId()
  const { data: marks } = useMyMarks()
  const { data: challenges } = useChallenges()
  const { data: plan, isPending: planPending } = useActivePlan()
  if (!marks || !challenges || planPending) return null
  return {
    bricks: marks.length,
    obra: obraFor(marks.length),
    list: achievements({ uid, marks, challenges, monthly: plan ? Number(plan.monthly_amount) : null }),
  }
}

/**
 * Comemora conquistas novas uma vez (confete + aviso) e guarda no perfil o que já foi comemorado.
 * Na primeira vez só registra o que a pessoa já tinha, sem comemorar tudo de uma vez.
 */
export function useCelebrate(unlocked: string[] | null) {
  const uid = useUserId()
  const qc = useQueryClient()
  const { data: profile } = useProfile()
  const saving = useRef(false)
  const key = unlocked?.join(',')

  useEffect(() => {
    if (!unlocked || !profile || saving.current) return
    const seen = profile.achievements_seen
    const fresh = seen ? unlocked.filter((id) => !seen.includes(id)) : []
    if (seen && !fresh.length) return
    saving.current = true
    if (fresh.length) {
      confetti()
      toast(fresh.length === 1 ? 'Conquista nova! Veja em Sua obra.' : `${fresh.length} conquistas novas! Veja em Sua obra.`)
    }
    const all = [...new Set([...(seen ?? []), ...unlocked])]
    qc.setQueryData<Profile>(['profile', uid], (p) => p && { ...p, achievements_seen: all })
    void supabase.from('profiles').update({ achievements_seen: all }).eq('id', uid).then(() => { saving.current = false })
  }, [key, profile?.achievements_seen]) // a lista muda de referência a cada render; a chave é o conteúdo
}
