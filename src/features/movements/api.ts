import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface Movement {
  id: string
  slug: string
  title: string
  description: string | null
  cover_url: string | null
  blocks: number
  mode: 'solo' | 'duo' | 'group'
  starts_at: string | null
  ends_at: string | null
}

export interface RankRow {
  display_name: string
  pct: number
  position: number
}

/** Movimentos ativos com o nº de participantes (público). */
export function useMovements() {
  return useQuery({
    queryKey: ['movements'],
    queryFn: async () => {
      const { data, error } = await supabase.from('movements').select('*').order('starts_at')
      if (error) throw error
      const counts = await Promise.all(
        data.map((m) => supabase.rpc('movement_participants', { p_slug: m.slug }).then((r) => (r.data as number) ?? 0)),
      )
      return (data as Movement[]).map((m, i) => ({ ...m, participants: counts[i] }))
    },
  })
}

export function useMovement(slug: string) {
  return useQuery({
    queryKey: ['movement', slug],
    queryFn: async () => {
      const [m, count, ranking] = await Promise.all([
        supabase.from('movements').select('*').eq('slug', slug).maybeSingle(),
        supabase.rpc('movement_participants', { p_slug: slug }),
        supabase.rpc('movement_ranking', { p_slug: slug }),
      ])
      if (m.error) throw m.error
      if (!m.data) return null
      return { ...(m.data as Movement), participants: (count.data as number) ?? 0, ranking: (ranking.data as RankRow[]) ?? [] }
    },
  })
}

/** Desafio do usuário logado neste movimento, se já participa (RLS: só os dele). */
export function useMyMovementChallenge(movementId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['movement-mine', movementId],
    enabled: enabled && !!movementId,
    queryFn: async () => {
      const { data } = await supabase.from('challenges').select('id').eq('movement_id', movementId!).limit(1).maybeSingle()
      return data?.id as string | undefined
    },
  })
}
