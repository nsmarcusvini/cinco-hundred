// Motor do plano personalizado (seção 6.8). Função pura: roda no front, inclusive no modo rápido.

export const GOAL = 125250
const AVG_BLOCK_500 = 250.5 // valor médio de um bloco no Desafio 500
const WEEKS_PER_MONTH = 4.33

export type ScenarioKey = 'leve' | 'recomendado' | 'acelerado'
export type PlanStatus = 'ok' | 'apertado' | 'resgate'

export interface Expense {
  category: string
  amount: number
}

export interface PlanInput {
  income: number // salário líquido + renda extra
  fixed: Expense[]
  variable: Expense[] | null // null = "Não sei, estime para mim"
  currentSavings: number
  hasEmergencyFund: boolean | null // null = não sei
  hasHighInterestDebt: boolean
  goal?: number
}

export interface PlanSettings {
  yieldRate: number // plan_yield_rate_monthly
  variableEstimatePct: number // plan_variable_estimate_pct
  safetyFactor: number // plan_safety_factor
  emergencyMonths: number // plan_emergency_months
}

export interface Projection {
  monthly: number
  weekly: number
  monthsNoYield: number | null // null = nunca chega (aporte 0)
  monthsWithYield: number | null
}

export interface Milestone {
  key: 'reserva' | '25' | '50' | '100mil' | 'meta'
  amount: number
  month: number | null // meses a partir de hoje, pela projeção com rendimento
}

export interface PlanResult {
  income: number
  fixos: number
  variaveis: number
  variableEstimated: boolean
  sobra: number
  comprometimento: number
  rule20: number
  scenarios: Record<ScenarioKey, Projection>
  suggested: ScenarioKey
  status: PlanStatus
  recommendedBlocks: 100 | 250 | 500
  ladder: number[]
  emergencyTarget: number | null
  topCategories: Expense[]
}

export const DEFAULT_SETTINGS: PlanSettings = {
  yieldRate: 0.008,
  variableEstimatePct: 0.15,
  safetyFactor: 0.8,
  emergencyMonths: 6,
}

const sum = (xs: Expense[]) => xs.reduce((t, x) => t + x.amount, 0)
const floor10 = (x: number) => Math.max(0, Math.floor(x / 10 + 1e-9) * 10)

/** Erros que impedem o cálculo e avisos que pedem confirmação. */
export function validatePlanInput(input: PlanInput): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  if (!(input.income >= 1 && input.income <= 1_000_000)) errors.push('Informe uma renda entre R$ 1 e R$ 1.000.000.')
  if (input.fixed.length === 0) errors.push('Informe pelo menos um gasto fixo.')
  if ([...input.fixed, ...(input.variable ?? [])].some((e) => !(e.amount >= 0)) || !(input.currentSavings >= 0)) {
    errors.push('Os valores não podem ser negativos.')
  }
  if (sum(input.fixed) > input.income) warnings.push('Seus gastos fixos passam da sua renda. Confira os valores?')
  return { errors, warnings }
}

/** Meses até `target` saindo de `start` com aporte mensal `monthly` e taxa mensal `rate`. */
export function monthsToReach(target: number, start: number, monthly: number, rate: number): number | null {
  if (start >= target) return 0
  if (monthly <= 0 && (rate <= 0 || start <= 0)) return null
  if (rate <= 0) return Math.ceil((target - start) / monthly)
  const n = Math.log((target * rate + monthly) / (start * rate + monthly)) / Math.log(1 + rate)
  return Math.ceil(n - 1e-9)
}

function project(monthly: number, input: PlanInput, rate: number): Projection {
  const goal = input.goal ?? GOAL
  return {
    monthly,
    weekly: Math.round(monthly / WEEKS_PER_MONTH),
    monthsNoYield: monthsToReach(goal, input.currentSavings, monthly, 0),
    monthsWithYield: monthsToReach(goal, input.currentSavings, monthly, rate),
  }
}

export function computePlan(input: PlanInput, s: PlanSettings = DEFAULT_SETTINGS): PlanResult {
  const fixos = sum(input.fixed)
  const variableEstimated = input.variable === null
  const variaveis = input.variable === null ? input.income * s.variableEstimatePct : sum(input.variable)
  const sobra = input.income - fixos - variaveis

  const scenarios = {
    leve: project(floor10(sobra * 0.5), input, s.yieldRate),
    recomendado: project(floor10(sobra * s.safetyFactor), input, s.yieldRate),
    acelerado: project(floor10(sobra), input, s.yieldRate),
  }

  // Status e escada usam o prazo sem rendimento (conservador, não depende da taxa de referência).
  const rec = scenarios.recomendado
  const months = rec.monthsNoYield ?? Infinity
  let status: PlanStatus = 'ok'
  if (sobra <= 0) status = 'resgate'
  else if (rec.monthly < 300 || months > 180) status = 'apertado'

  let ladder: number[]
  if (status === 'resgate') ladder = [100]
  else if (status === 'apertado') ladder = [100, 250, 500]
  else if (months <= 60) ladder = [500]
  else ladder = [250, 500]

  const topCategories = [...input.fixed, ...(input.variable ?? [])]
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  return {
    income: input.income,
    fixos,
    variaveis,
    variableEstimated,
    sobra,
    comprometimento: input.income > 0 ? (fixos + variaveis) / input.income : 1,
    rule20: input.income * 0.2,
    scenarios,
    suggested: input.hasHighInterestDebt ? 'leve' : 'recomendado',
    status,
    recommendedBlocks: ladder[0] as 100 | 250 | 500,
    ladder,
    emergencyTarget: input.hasEmergencyFund === true ? null : fixos * s.emergencyMonths,
    topCategories,
  }
}

/** Marcos com mês previsto (projeção com rendimento) para um aporte escolhido. */
export function milestones(plan: PlanResult, monthly: number, currentSavings: number, rate: number, goal = GOAL): Milestone[] {
  const at = (amount: number) => monthsToReach(amount, currentSavings, monthly, rate)
  const list: Milestone[] = []
  if (plan.emergencyTarget) list.push({ key: 'reserva', amount: plan.emergencyTarget, month: at(plan.emergencyTarget) })
  list.push(
    { key: '25', amount: goal * 0.25, month: at(goal * 0.25) },
    { key: '50', amount: goal * 0.5, month: at(goal * 0.5) },
    { key: '100mil', amount: 100_000, month: at(100_000) },
    { key: 'meta', amount: goal, month: at(goal) },
  )
  return list
}

/** "Você precisa marcar cerca de X blocos por mês (≈ Y por semana)". */
export function blocksPace(monthly: number) {
  const perMonth = monthly / AVG_BLOCK_500
  return { perMonth, perWeek: perMonth / WEEKS_PER_MONTH }
}

/** Prazo com mais uma pessoa guardando o mesmo valor (sem rendimento). */
export function monthsWithPartner(monthly: number, currentSavings: number, goal = GOAL): number | null {
  return monthsToReach(goal, currentSavings, monthly * 2, 0)
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + months)
  return d
}

export type MonthStatus = 'em_dia' | 'atrasado' | 'adiantado'

/** Status do mês no card da Início: proporcional ao dia do mês. */
export function monthStatus(goal: number, saved: number, day: number, daysInMonth: number): MonthStatus {
  if (saved >= goal) return 'adiantado'
  return saved >= (goal * day) / daysInMonth ? 'em_dia' : 'atrasado'
}

/** Chave AAAA-MM do mês, no fuso do aparelho. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * Os dois meses fechados anteriores ficaram abaixo de 50% da meta. Só conta meses
 * inteiros com o plano ativo: um plano criado no meio de um deles não dispara a sugestão.
 */
export function belowHalfTwoMonths(monthly: number, savedByMonth: Record<string, number>, planStart: Date, now = new Date()): boolean {
  if (monthly <= 0 || planStart > new Date(now.getFullYear(), now.getMonth() - 2, 1)) return false
  return [1, 2].every((ago) => (savedByMonth[monthKey(new Date(now.getFullYear(), now.getMonth() - ago, 1))] ?? 0) < monthly * 0.5)
}
