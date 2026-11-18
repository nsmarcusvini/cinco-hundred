import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from '../../components/Toast'
import { track } from '../../lib/analytics'
import { realtime, supabase } from '../../lib/supabase'
import type { MemberInitial } from '../../lib/initialBalance'
import { useUserId } from '../auth/AuthProvider'
import { NO_ACCESS_TOAST, type MarkVars, type UnmarkVars } from './mutations'

export interface Challenge {
  id: string
  owner_id: string
  title: string
  blocks: number
  type: 'solo' | 'duo' | 'group'
  invite_code: string
  target_date: string | null
  status: 'active' | 'completed' | 'archived'
  movement_id: string | null
  created_at: string
}

export interface Member {
  user_id: string
  display_name: string
  color: string
  role: 'owner' | 'member'
}

export interface Mark {
  block: number
  user_id: string
  marked_at: string
}

export interface ChallengeDetail extends Challenge {
  members: Member[]
  marks: Mark[]
  /**
   * Saldos iniciais declarados, um por pessoa. No individual ("Já comecei") só o dono lê (RLS);
   * em dupla ou grupo os membros veem o de todos (20261118120000).
   */
  initials: MemberInitial[]
}

export interface ChallengeSummary extends Challenge {
  saved: number // marcações + blocos do saldo inicial
  marked: number // blocos fechados, contando os do saldo inicial
  memberCount: number
  /** Parte que veio do saldo inicial: não conta como hábito (conquistas descontam). */
  initialSaved: number
  initialBlocks: number
}

const sum = (xs: number[]) => xs.reduce((t, b) => t + b, 0)

/** O embed do saldo inicial chega como lista (uma linha por pessoa) ou, no cache antigo do PostgREST, como objeto. */
const many = <T,>(x: T | T[] | null | undefined): T[] => (Array.isArray(x) ? x : x ? [x] : [])

export function useChallenges() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['challenges', uid],
    queryFn: async (): Promise<ChallengeSummary[]> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*, block_marks(block), challenge_members(user_id), initial:challenge_initial_balances(blocks)')
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(({ block_marks, challenge_members, initial, ...c }) => {
        const initialBlocks = many(initial as { blocks: number[] } | { blocks: number[] }[] | null).flatMap((i) => i.blocks)
        return {
          ...(c as Challenge),
          saved: sum((block_marks as { block: number }[]).map((m) => m.block)) + sum(initialBlocks),
          marked: block_marks.length + initialBlocks.length,
          memberCount: challenge_members.length,
          initialSaved: sum(initialBlocks),
          initialBlocks: initialBlocks.length,
        }
      })
    },
  })
}

export const challengeKey = (id: string) => ['challenge', id] as const

export function useChallenge(id: string) {
  return useQuery({
    queryKey: challengeKey(id),
    queryFn: async (): Promise<ChallengeDetail | null> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*, members:challenge_members(user_id, display_name, color, role), marks:block_marks(block, user_id, marked_at), initial:challenge_initial_balances(user_id, amount_cents, blocks)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const { initial, ...rest } = data
      const initials = many(initial as MemberInitial | MemberInitial[] | null)
        .map((i) => ({ user_id: i.user_id, amount_cents: Number(i.amount_cents), blocks: i.blocks }))
      return { ...rest, initials } as ChallengeDetail
    },
  })
}

/**
 * Marcações e participantes em tempo real. Inserções chegam filtradas pelo desafio;
 * exclusões não aceitam filtro no Realtime e trazem só a chave, então filtramos aqui.
 */
export function useChallengeRealtime(id: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const patch = (fn: (c: ChallengeDetail) => ChallengeDetail) =>
      qc.setQueryData<ChallengeDetail | null>(challengeKey(id), (c) => c && fn(c))
    let stop = () => {}
    let cancelled = false
    void realtime().then((rt) => {
      if (cancelled) return
      const channel = rt
        .channel(`challenge:${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'block_marks', filter: `challenge_id=eq.${id}` },
          ({ new: m }) => patch((c) => c.marks.some((x) => x.block === m.block)
            ? c
            : { ...c, marks: [...c.marks, { block: m.block, user_id: m.user_id, marked_at: m.marked_at }] }))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'block_marks' },
          ({ old }) => old.challenge_id === id && patch((c) => ({ ...c, marks: c.marks.filter((x) => x.block !== old.block) })))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_members', filter: `challenge_id=eq.${id}` },
          () => qc.invalidateQueries({ queryKey: challengeKey(id) }))
        // Saldo inicial declarado ou corrigido por alguém do grupo (a exclusão traz só a chave, por isso o filtro aqui).
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_initial_balances' },
          ({ new: n, old: o }) => ((n as { challenge_id?: string })?.challenge_id ?? (o as { challenge_id?: string })?.challenge_id) === id
            && qc.invalidateQueries({ queryKey: challengeKey(id) }))
        .subscribe()
      stop = () => void rt.removeChannel(channel)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [id, qc])
}

/** Marca blocos na hora (otimista); se o servidor recusar, desfaz e avisa. Sem internet, fica na fila (ver mutations.ts). */
export function useMarkBlocks(id: string) {
  const uid = useUserId()
  const qc = useQueryClient()
  const m = useMutation<void, { code?: string }, MarkVars, { prev: ChallengeDetail | null | undefined }>({
    mutationKey: ['mark'],
    onMutate: async ({ blocks }) => {
      await qc.cancelQueries({ queryKey: challengeKey(id) })
      const prev = qc.getQueryData<ChallengeDetail | null>(challengeKey(id))
      const now = new Date().toISOString()
      qc.setQueryData<ChallengeDetail | null>(challengeKey(id), (c) =>
        c && { ...c, marks: [...c.marks, ...blocks.map((block) => ({ block, user_id: uid, marked_at: now }))] })
      navigator.vibrate?.(12)
      return { prev }
    },
    onError: (error, _vars, ctx) => {
      qc.setQueryData(challengeKey(id), ctx?.prev)
      toast(
        error.code === '23505'
          ? 'Alguém do grupo marcou um desses blocos antes. A grade foi atualizada.'
          : error.code === '42501'
            ? NO_ACCESS_TOAST
            : 'Não foi possível marcar agora. Tente de novo.',
        'error',
      )
    },
    onSuccess: (_d, { blocks, via }) => track('block_marked', { count: blocks.length, via }),
    onSettled: () => refresh(qc, id, uid),
  })
  return { ...m, mutate: (v: Pick<MarkVars, 'blocks' | 'via'>) => m.mutate({ ...v, challengeId: id, userId: uid }) }
}

export function useUnmarkBlock(id: string) {
  const uid = useUserId()
  const qc = useQueryClient()
  const m = useMutation<void, Error, UnmarkVars, { prev: ChallengeDetail | null | undefined }>({
    mutationKey: ['unmark'],
    onMutate: async ({ block }) => {
      await qc.cancelQueries({ queryKey: challengeKey(id) })
      const prev = qc.getQueryData<ChallengeDetail | null>(challengeKey(id))
      qc.setQueryData<ChallengeDetail | null>(challengeKey(id), (c) =>
        c && { ...c, marks: c.marks.filter((m) => m.block !== block) })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(challengeKey(id), ctx?.prev)
      toast('Não foi possível desmarcar agora. Tente de novo.', 'error')
    },
    onSettled: () => refresh(qc, id, uid),
  })
  return { ...m, mutate: (block: number) => m.mutate({ block, challengeId: id, userId: uid }) }
}

function refresh(qc: ReturnType<typeof useQueryClient>, id: string, uid: string) {
  qc.invalidateQueries({ queryKey: challengeKey(id) })
  qc.invalidateQueries({ queryKey: ['challenges', uid] })
  qc.invalidateQueries({ queryKey: ['saved-by-month', uid] })
}

/** Declara ou corrige o próprio saldo inicial num desafio em dupla ou grupo. R$ 0 apaga ("vou começar do zero"). */
export async function setInitialBalance(challengeId: string, cents: number) {
  const { error } = await supabase.rpc('set_initial_balance', { p_challenge: challengeId, p_amount_cents: cents })
  if (!error) track('initial_balance_set', { shared: true, zero: cents === 0 })
  return error
}
