import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from '../../components/Toast'
import { track } from '../../lib/analytics'
import { clearPending, setPending } from '../../lib/pending'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { setInitialBalance } from '../challenges/api'

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
  accepts_initial_balance?: boolean // "Já comecei": entra informando o saldo que já tem guardado
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
 *
 * Movimento com saldo inicial ("Já comecei"): em vez de entrar direto, abre a pergunta (`ask`) e entra
 * por start_movement_with_balance quando a pessoa confirma. Quem usa o hook renderiza o InitialBalanceSheet.
 */
export function useJoinMovement() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const inFlight = useRef(false)
  const [busySlug, setBusySlug] = useState<string | null>(null)
  // shared: movimento em dupla/grupo, pergunta o saldo de cada um (set_initial_balance) em vez do "Já comecei".
  const [ask, setAsk] = useState<{ slug: string; blocks: number; name: string; shared: boolean } | null>(null)

  async function run(slug: string, fn: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusySlug(slug)
    try {
      await fn()
    } finally {
      inFlight.current = false
      setBusySlug(null)
    }
  }

  async function entered(slug: string, data: unknown) {
    clearPending()
    track('movement_joined', { slug })
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['challenges'] }),
      qc.invalidateQueries({ queryKey: ['movements'] }),
      qc.invalidateQueries({ queryKey: ['movement-mine'] }),
    ])
    navigate(`/app/d/${data}`)
  }

  async function join(slug: string, movement?: Pick<Movement, 'blocks' | 'accepts_initial_balance' | 'mode'>) {
    if (inFlight.current) return
    setPending({ kind: 'movement', slug })
    if (!session) return navigate(`/cadastro?next=${encodeURIComponent(`/m/${slug}`)}`)
    await run(slug, async () => {
      const { data: profile } = await supabase.from('profiles').select('display_name, has_access').eq('id', session.user.id).single()
      if (!profile?.has_access) return void navigate('/app/acesso')
      const name = profile.display_name || 'Participante'
      if (movement?.accepts_initial_balance) return setAsk({ slug, blocks: movement.blocks, name, shared: false })
      if (movement && movement.mode !== 'solo') return setAsk({ slug, blocks: movement.blocks, name, shared: true })
      const { data, error } = await supabase.rpc('join_movement', { p_slug: slug, p_name: name })
      if (error) return toast(error.message || 'Não foi possível entrar agora. Tente de novo.', 'error')
      await entered(slug, data)
    })
  }

  async function startWithBalance(cents: number) {
    if (!ask) return
    const { slug, name, shared } = ask
    await run(slug, async () => {
      if (shared) {
        // Entra primeiro; se o saldo falhar, a pessoa já está no desafio e informa de novo por lá.
        const { data, error } = await supabase.rpc('join_movement', { p_slug: slug, p_name: name })
        if (error) return toast(error.message || 'Não foi possível entrar agora. Tente de novo.', 'error')
        if (cents > 0) {
          const e = await setInitialBalance(data as string, cents)
          if (e) toast(`Você entrou, mas o saldo inicial não foi salvo: ${e.message}. Informe na página do desafio.`, 'error')
        }
        setAsk(null)
        return entered(slug, data)
      }
      const { data, error } = await supabase.rpc('start_movement_with_balance', { p_slug: slug, p_name: name, p_amount_cents: cents })
      if (error) return toast(error.message || 'Não foi possível entrar agora. Tente de novo.', 'error')
      setAsk(null)
      await entered(slug, data)
    })
  }

  return { join, busySlug, ask, closeAsk: () => setAsk(null), startWithBalance }
}
