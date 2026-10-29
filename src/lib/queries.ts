import { useQuery } from '@tanstack/react-query'
import { useUserId } from '../features/auth/AuthProvider'
import type { SavingsGoal } from './goals'
import { DEFAULT_SETTINGS, type PlanSettings, type PlanStatus } from './plan'
import { supabase } from './supabase'

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  has_access: boolean
  access_granted_at: string | null
  onboarding_done: boolean
  onboarding_step: number
  reminder_enabled: boolean
  reminder_time: string
  reminder_days: number[]
  show_in_rankings: boolean
  show_in_global_ranking: boolean
  marketing_opt_in: boolean
  timezone: string
  savings_goal: SavingsGoal | null
  savings_goal_other: string | null
  utm_source: string | null
  last_checkin_month: string | null
  tour_done_at: string | null
  achievements_seen: string[] | null
}

export interface SavingsPlan {
  id: string
  scenario: 'leve' | 'recomendado' | 'acelerado' | 'personalizado'
  goal: number
  monthly_amount: number
  start_balance: number
  months_estimated: number | null
  months_with_yield: number | null
  yield_rate_monthly: number | null
  target_date: string | null
  recommended_blocks: number | null
  ladder: number[] | null
  status: PlanStatus
  inputs_snapshot: PlanSnapshot | null
  created_at: string
}

/** Resumo salvo com o plano (só no modo completo, com consentimento). */
export interface PlanSnapshot {
  income: number
  fixos: number
  variaveis: number
  variableEstimated: boolean
  currentSavings: number
  hasEmergencyFund: boolean | null
  hasHighInterestDebt: boolean
}

export interface AppSettings extends PlanSettings {
  priceLabel: string
}

export function useProfile() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['profile', uid],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single()
      if (error) throw error
      return data as Profile
    },
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    staleTime: Infinity,
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase.from('app_settings').select('key, value')
      if (error) throw error
      const v = Object.fromEntries(data.map((r) => [r.key, r.value]))
      return {
        yieldRate: v.plan_yield_rate_monthly ?? DEFAULT_SETTINGS.yieldRate,
        variableEstimatePct: v.plan_variable_estimate_pct ?? DEFAULT_SETTINGS.variableEstimatePct,
        safetyFactor: v.plan_safety_factor ?? DEFAULT_SETTINGS.safetyFactor,
        emergencyMonths: v.plan_emergency_months ?? DEFAULT_SETTINGS.emergencyMonths,
        priceLabel: v.price_label ?? 'R$ 10',
      }
    },
  })
}

export function useActivePlan() {
  const uid = useUserId()
  return useQuery({
    queryKey: ['plan', uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('savings_plans').select('*').eq('user_id', uid).eq('is_active', true).maybeSingle()
      if (error) throw error
      return data as SavingsPlan | null
    },
  })
}

/** Soma dos blocos marcados pelo usuário desde `since`, agrupada por mês (AAAA-MM). Objeto (não Map) para sobreviver ao cache em JSON. */
export function useSavedByMonth(since: string | undefined) {
  const uid = useUserId()
  return useQuery({
    queryKey: ['saved-by-month', uid, since],
    enabled: !!since,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('block_marks').select('block, marked_at').eq('user_id', uid).gte('marked_at', since!)
      if (error) throw error
      const byMonth: Record<string, number> = {}
      for (const r of data) {
        const key = r.marked_at.slice(0, 7)
        byMonth[key] = (byMonth[key] ?? 0) + r.block
      }
      return byMonth
    },
  })
}
