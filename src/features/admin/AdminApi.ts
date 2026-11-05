import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { supabase } from '../../lib/supabase'

// Todas as chaves começam com 'admin': src/lib/offline.ts deixa essas consultas fora do cache em disco.
const GC = 5 * 60_000

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export type AccessState =
  | 'pago' | 'assinante' | 'teste' | 'cortesia' | 'com_acesso'
  | 'atrasado' | 'cancelado' | 'reembolsado' | 'contestado' | 'pendente' | 'sem_acesso'

export const ACCESS_LABEL: Record<AccessState, string> = {
  assinante: 'Assinante',
  pago: 'Compra única',
  teste: 'Em teste grátis',
  cortesia: 'Cortesia',
  com_acesso: 'Com acesso',
  atrasado: 'Pagamento atrasado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
  contestado: 'Contestado',
  pendente: 'Pagamento pendente',
  sem_acesso: 'Sem acesso',
}

export const WITH_ACCESS: AccessState[] = ['assinante', 'pago', 'teste', 'cortesia', 'com_acesso']

export interface UserRow {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
  onboarding_done: boolean
  onboarding_step: number
  utm_source: string | null
  banned: boolean
  access: AccessState
  last_seen_at: string | null
  challenges: number
  blocks_marked: number
}

export interface UsersFilters {
  search: string
  access: string
  onboarding: string
  activity: string
  source: string
  sort: string
  page: number
}

export const PAGE_SIZE = 50

export function useUsers(f: UsersFilters) {
  return useQuery({
    queryKey: ['admin', 'users', f],
    queryFn: () => rpc<{ total: number; sources: string[]; rows: UserRow[] }>('admin_users', {
      p_search: f.search || null,
      p_access: f.access || null,
      p_onboarding: f.onboarding || null,
      p_activity: f.activity || null,
      p_source: f.source || null,
      p_sort: f.sort || 'recentes',
      p_limit: PAGE_SIZE,
      p_offset: (f.page - 1) * PAGE_SIZE,
    }),
    gcTime: GC,
    placeholderData: keepPreviousData,
  })
}

export interface UserDetail {
  profile: {
    id: string
    email: string | null
    display_name: string | null
    city: string | null
    state: string | null
    age: number | null
    created_at: string
    timezone: string
    email_confirmed: boolean
    last_sign_in_at: string | null
    banned: boolean
    is_admin: boolean
    utm_source: string | null
    utm_campaign: string | null
    marketing_opt_in: boolean
    show_in_rankings: boolean
    show_in_global_ranking: boolean
    reminder_enabled: boolean
    onboarding_done: boolean
    onboarding_step: number
    tour_done: boolean
    saving_with: 'sozinho' | 'junto' | null
    savings_goal: string | null
    has_plan: boolean
    push_enabled: boolean
    has_access: boolean
    access_granted_at: string | null
    access: AccessState
    last_seen_at: string | null
    views_30d: number
  }
  subscription: {
    status: string
    plan: 'monthly' | 'annual' | null
    trial_end: string | null
    current_period_end: string | null
    cancel_at: string | null
    stripe_customer_id: string | null
  } | null
  purchases: {
    created_at: string
    status: string
    amount: number | null
    currency: string
    promotion_code: string | null
    stripe_customer_id: string | null
    courtesy: boolean
  }[]
  challenges: {
    id: string
    title: string
    blocks: number
    type: 'solo' | 'duo' | 'group'
    status: 'active' | 'completed' | 'archived'
    role: 'owner' | 'member'
    created_at: string
    completed_at: string | null
    members: number
    marked_total: number
    marked_by_user: number
    last_mark_at: string | null
  }[]
  events: { name: string; created_at: string }[]
  audit: { action: string; created_at: string }[]
}

export function useUserDetail(id: string) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => rpc<UserDetail>('admin_user_detail', { p_user: id }),
    gcTime: GC,
    staleTime: 60_000,
    refetchOnWindowFocus: false, // cada leitura fica registrada no log do admin
    retry: false,
  })
}

export const setCourtesy = (id: string, on: boolean) => rpc<AccessState>('admin_set_courtesy', { p_user: id, p_on: on })

export async function setBan(id: string, banned: boolean) {
  const { error } = await supabase.functions.invoke('admin-set-ban', { body: { user_id: id, banned } })
  if (error) throw error
}

export interface Overview {
  users: number
  new_users: number
  paying: number
  trialing: number
  courtesy: number
  blocks_marked: number
  active_today: number
  active_7d: number
  active_30d: number
  daily: { day: string; signups: number; active: number }[]
  weekly: { week: string; active: number }[]
}

export function useOverview(days: number) {
  return useQuery({
    queryKey: ['admin', 'overview', days],
    queryFn: () => rpc<Overview>('admin_overview', { p_days: days }),
    gcTime: GC,
  })
}

export interface Usage {
  pages: { route: string; views: number; users: number; anonymous: number }[]
  features: { name: string; times: number; users: number }[]
  vitals: { route: string; metric: 'LCP' | 'INP' | 'CLS'; samples: number; p75: number }[]
}

export function useUsage(days: number) {
  return useQuery({
    queryKey: ['admin', 'usage', days],
    queryFn: () => rpc<Usage>('admin_usage', { p_days: days }),
    gcTime: GC,
  })
}

export interface Funnel {
  signups: number
  onboarded: number
  checkout: number
  trial: number
  paid: number
  first_block: number
  canceled_checkout: number
  paid_no_block: number
  stalled: { step: number; users: number }[]
}

export function useFunnel(days: number) {
  return useQuery({
    queryKey: ['admin', 'funnel', days],
    queryFn: () => rpc<Funnel>('admin_funnel', { p_days: days }),
    gcTime: GC,
  })
}

export interface RetentionRow {
  week: string
  size: number
  retained: number[]
}

export function useRetention(weeks: number) {
  return useQuery({
    queryKey: ['admin', 'retention', weeks],
    queryFn: () => rpc<RetentionRow[]>('admin_retention', { p_weeks: weeks }),
    gcTime: GC,
  })
}

/** Período dos relatórios: fica no endereço, para sobreviver ao voltar e ao trocar de aba. */
export const PERIODS = [7, 30, 90, 365]

export function usePeriod(fallback = 30): [number, (days: number) => void] {
  const [params, setParams] = useSearchParams()
  const parsed = Number(params.get('dias'))
  const days = PERIODS.includes(parsed) ? parsed : fallback
  return [days, (d) => setParams({ dias: String(d) }, { replace: true })]
}

/** Nome de cada evento em português. O que não está aqui aparece com o nome técnico. */
export const EVENT_LABEL: Record<string, string> = {
  signup: 'Cadastro',
  onboarding_step: 'Avançou no onboarding',
  onboarding_done: 'Concluiu o onboarding',
  onboarding_skipped: 'Usou o modo rápido no onboarding',
  plan_created: 'Criou um plano',
  challenge_created: 'Criou um desafio',
  challenge_archived: 'Arquivou um desafio',
  block_marked: 'Marcou blocos',
  invite_sent: 'Enviou convite',
  invite_accepted: 'Aceitou convite',
  share_card: 'Compartilhou o card',
  movement_joined: 'Entrou em um movimento',
  access_offer_view: 'Viu a oferta de acesso',
  checkout_started: 'Abriu o pagamento',
  checkout_canceled: 'Voltou do pagamento sem pagar',
  access_granted: 'Compra aprovada',
  refund: 'Reembolso',
  push_enabled: 'Ativou lembretes',
  tour_done: 'Terminou o tutorial',
  app_installed: 'Instalou o app',
  data_exported: 'Exportou os dados',
  account_deleted: 'Excluiu a conta',
  invoice_paid: 'Fatura paga',
  invoice_payment_failed: 'Cobrança falhou',
  subscription_trialing: 'Começou o teste grátis',
  subscription_active: 'Assinatura ativa',
  subscription_past_due: 'Assinatura atrasada',
  subscription_unpaid: 'Assinatura sem pagamento',
  subscription_canceled: 'Assinatura cancelada',
  subscription_incomplete: 'Assinatura incompleta',
  subscription_incomplete_expired: 'Assinatura expirada',
}

/** Recursos do produto: os que não aparecem nos eventos do período viram "sem uso". */
export const PRODUCT_FEATURES = [
  'plan_created', 'challenge_created', 'block_marked', 'invite_sent', 'invite_accepted', 'share_card',
  'movement_joined', 'push_enabled', 'tour_done', 'app_installed', 'data_exported',
]

const ROUTE_LABEL: Record<string, string> = {
  '/': 'Página inicial',
  '/entrar': 'Entrar',
  '/cadastro': 'Cadastro',
  '/redefinir-senha': 'Redefinir senha',
  '/termos': 'Termos',
  '/privacidade': 'Privacidade',
  '/onboarding': 'Onboarding',
  '/app': 'Início do app',
  '/app/plano': 'Plano',
  '/app/novo': 'Novo desafio',
  '/app/d/:id': 'Desafio',
  '/app/d/:id/historico': 'Histórico do desafio',
  '/app/conquistas': 'Conquistas',
  '/app/ranking': 'Ranking',
  '/app/config': 'Configurações',
  '/app/acesso': 'Oferta de acesso',
  '/app/bem-vindo': 'Volta do pagamento',
  '/convite/:code': 'Convite',
  '/m/:slug': 'Movimento',
}

export const routeLabel = (route: string) => ROUTE_LABEL[route] ?? route

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
const dateOnly = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' })

export const fmtDateTime = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : 'Nunca')
export const fmtDate = (iso: string | null) => (iso ? dateOnly.format(new Date(iso)) : 'Nunca')
/** "2026-11-04" (dia, sem horário) vira "04/11". */
export const fmtDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`

export function fmtAgo(iso: string | null) {
  if (!iso) return 'Nunca'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return days < 60 ? `Há ${days} dias` : fmtDate(iso)
}

export const fmtCents = (cents: number | null, currency = 'brl') =>
  cents === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
