import { supabase } from '../../lib/supabase'
import type { SavingsGoal } from '../../lib/goals'
import type { Expense, PlanInput, ScenarioKey } from '../../lib/plan'

export const FIXED_CATEGORIES = [
  { key: 'moradia', label: 'Moradia', icon: '🏠' },
  { key: 'contas_casa', label: 'Contas da casa', icon: '💡' },
  { key: 'mercado', label: 'Mercado', icon: '🛒' },
  { key: 'transporte', label: 'Transporte', icon: '🚌' },
  { key: 'saude', label: 'Saúde e plano', icon: '🩺' },
  { key: 'educacao', label: 'Educação', icon: '🎓' },
  { key: 'dividas_parcelas', label: 'Dívidas e parcelas', icon: '💳' },
  { key: 'assinaturas', label: 'Assinaturas', icon: '📺' },
  { key: 'filhos_pets', label: 'Filhos e pets', icon: '🧸' },
  { key: 'outros', label: 'Outros', icon: '📦' },
] as const

export const VARIABLE_CATEGORIES = [
  { key: 'lazer', label: 'Lazer', icon: '🎉' },
  { key: 'delivery_restaurante', label: 'Delivery e restaurante', icon: '🍔' },
  { key: 'compras', label: 'Compras', icon: '🛍️' },
  { key: 'outros', label: 'Outros', icon: '📦' },
] as const

/** Resposta de "Você já tem uma caixinha?" (profiles.bank_box). */
export type BankBox = 'sim' | 'nao' | 'nao_sei'

export type IncomeType = 'clt' | 'autonomo' | 'servidor' | 'empresario' | 'outro'

export interface Draft {
  step: number
  skipped: boolean // "Pular, só quero o desafio"
  bankBox: BankBox | null
  consentAt: string | null // null + quick = modo rápido (nada financeiro é salvo)
  quick: boolean
  displayName: string
  showInGlobalRanking: boolean | null // null = ainda não respondeu
  goal: SavingsGoal | null
  goalOther: string
  birthDate: string
  city: string
  state: string
  incomeType: IncomeType | null
  income: number | null
  extraIncome: number | null
  paydays: number[]
  fixed: Record<string, number>
  variable: Record<string, number> | null // null = estimar
  currentSavings: number | null
  hasEmergencyFund: boolean | null
  hasHighInterestDebt: boolean | null
  scenario: ScenarioKey | 'personalizado'
  customMonthly: number | null
}

export const emptyDraft = (displayName = '', goal: SavingsGoal | null = null, goalOther = ''): Draft => ({
  step: 1,
  skipped: false,
  bankBox: null,
  consentAt: null,
  quick: false,
  displayName,
  showInGlobalRanking: null,
  goal,
  goalOther,
  birthDate: '',
  city: '',
  state: '',
  incomeType: null,
  income: null,
  extraIncome: null,
  paydays: [5],
  fixed: {},
  variable: {},
  currentSavings: null,
  hasEmergencyFund: null,
  hasHighInterestDebt: null,
  scenario: 'recomendado',
  customMonthly: null,
})

const key = (uid: string) => `ch.onboarding.${uid}`

export function loadLocalDraft(uid: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(uid))
    return raw ? { ...emptyDraft(), ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

export function saveLocalDraft(uid: string, d: Draft) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(d))
  } catch {
    /* storage indisponível: o passo também fica no profile */
  }
}

export function clearLocalDraft(uid: string) {
  try {
    localStorage.removeItem(key(uid))
  } catch {
    /* ignore */
  }
}

const toExpenses = (r: Record<string, number>): Expense[] =>
  Object.entries(r).filter(([, v]) => v > 0).map(([category, amount]) => ({ category, amount }))

export function toPlanInput(d: Draft): PlanInput {
  return {
    income: (d.income ?? 0) + (d.extraIncome ?? 0),
    fixed: toExpenses(d.fixed),
    variable: d.variable === null ? null : toExpenses(d.variable),
    currentSavings: d.currentSavings ?? 0,
    hasEmergencyFund: d.hasEmergencyFund,
    hasHighInterestDebt: d.hasHighInterestDebt ?? false,
  }
}

/** Remonta o rascunho a partir do banco (refazer o plano ou retomar em outro aparelho). */
export async function loadDraftFromDb(uid: string, base: Draft): Promise<Draft> {
  const [{ data: fp }, { data: exps }] = await Promise.all([
    supabase.from('financial_profiles').select('*').eq('user_id', uid).maybeSingle(),
    supabase.from('expenses').select('kind, category, amount').eq('user_id', uid),
  ])
  if (!fp) return base
  const fixed: Record<string, number> = {}
  const variable: Record<string, number> = {}
  for (const e of exps ?? []) (e.kind === 'fixed' ? fixed : variable)[e.category] = Number(e.amount)
  return {
    ...base,
    consentAt: fp.consent_at,
    incomeType: fp.income_type,
    income: Number(fp.monthly_income ?? 0) || null,
    extraIncome: Number(fp.extra_income) || null,
    paydays: fp.paydays,
    fixed,
    variable: fp.variable_estimated ? null : variable,
    currentSavings: Number(fp.current_savings),
    hasEmergencyFund: fp.has_emergency_fund,
    hasHighInterestDebt: fp.has_high_interest_debt,
  }
}

/** Salva no banco o que o passo `step` coletou. No modo rápido nada financeiro é salvo. */
export async function persistStep(uid: string, step: number, d: Draft) {
  const fp = (fields: Record<string, unknown>) =>
    supabase.from('financial_profiles').upsert({
      user_id: uid, consent_at: d.consentAt, updated_at: new Date().toISOString(), ...fields,
    })
  const replaceExpenses = async (kind: 'fixed' | 'variable', r: Record<string, number>) => {
    const del = await supabase.from('expenses').delete().eq('user_id', uid).eq('kind', kind)
    if (del.error) return del
    const rows = toExpenses(r).map((e) => ({ user_id: uid, kind, ...e }))
    return rows.length ? supabase.from('expenses').insert(rows) : del
  }

  let res: { error: unknown } | null = null
  if (step === 2) {
    res = await supabase.from('profiles').update({ bank_box: d.bankBox }).eq('id', uid)
  } else if (step === 3) {
    res = await supabase.from('profiles').update({
      display_name: d.displayName.trim(),
      show_in_global_ranking: d.showInGlobalRanking ?? false,
      savings_goal: d.goal,
      savings_goal_other: d.goal === 'outros' ? d.goalOther.trim() || null : null,
      birth_date: d.birthDate || null,
      city: d.city.trim() || null,
      state: d.state.trim().toUpperCase() || null,
    }).eq('id', uid)
  } else if (d.consentAt && !d.quick) {
    if (step === 4) res = await fp({ income_type: d.incomeType })
    if (step === 5) res = await fp({ monthly_income: d.income, extra_income: d.extraIncome ?? 0, paydays: d.paydays })
    if (step === 6) res = await replaceExpenses('fixed', d.fixed)
    if (step === 7) {
      res = await fp({ variable_estimated: d.variable === null })
      if (!res.error && d.variable) res = await replaceExpenses('variable', d.variable)
    }
    if (step === 8) {
      res = await fp({
        current_savings: d.currentSavings ?? 0,
        has_emergency_fund: d.hasEmergencyFund,
        has_high_interest_debt: d.hasHighInterestDebt,
      })
    }
  }
  if (res?.error) throw res.error
}
