import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from '../../components/Toast'
import { track } from '../../lib/analytics'
import { clearPending, setPending } from '../../lib/pending'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

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

/**
 * Entrar num movimento a partir do card (Início) ou da página /m/:slug.
 * Um toque por vez: enquanto a entrada está em andamento, outros toques são ignorados.
 * O servidor também é idempotente (join_movement devolve o desafio que já existe).
 */
export function useJoinMovement() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const inFlight = useRef(false)
  const [busySlug, setBusySlug] = useState<string | null>(null)

  async function join(slug: string) {
    if (inFlight.current) return
    setPending({ kind: 'movement', slug })
    if (!session) return navigate(`/cadastro?next=${encodeURIComponent(`/m/${slug}`)}`)
    inFlight.current = true
    setBusySlug(slug)
    try {
      const { data: profile } = await supabase.from('profiles').select('display_name, has_access').eq('id', session.user.id).single()
      if (!profile?.has_access) return navigate('/app/acesso')
      const { data, error } = await supabase.rpc('join_movement', { p_slug: slug, p_name: profile.display_name || 'Participante' })
      if (error) return toast(error.message || 'Não foi possível entrar agora. Tente de novo.', 'error')
      clearPending()
      track('movement_joined', { slug })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['challenges'] }),
        qc.invalidateQueries({ queryKey: ['movements'] }),
        qc.invalidateQueries({ queryKey: ['movement-mine'] }),
      ])
      navigate(`/app/d/${data}`)
    } finally {
      inFlight.current = false
      setBusySlug(null)
    }
  }

  return { join, busySlug }
}
