import { addMonths, GOAL, monthsToReach, type PlanInput, type PlanResult, type PlanSettings } from '../../lib/plan'
import type { PlanSnapshot } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { monthsBucket, track } from '../../lib/analytics'

/** Grava o plano escolhido como plano ativo (o anterior vira histórico). */
export async function savePlan(opts: {
  plan: PlanResult
  input: PlanInput
  scenario: 'leve' | 'recomendado' | 'acelerado' | 'personalizado'
  monthly: number
  settings: PlanSettings
  quick: boolean // modo rápido: não guarda renda nem gastos
}) {
  const { plan, input, scenario, monthly, settings, quick } = opts
  const monthsNoYield = monthsToReach(GOAL, input.currentSavings, monthly, 0)
  const monthsWithYield = monthsToReach(GOAL, input.currentSavings, monthly, settings.yieldRate)
  const snapshot: PlanSnapshot | null = quick ? null : {
    income: plan.income,
    fixos: plan.fixos,
    variaveis: plan.variaveis,
    variableEstimated: plan.variableEstimated,
    currentSavings: input.currentSavings,
    hasEmergencyFund: input.hasEmergencyFund,
    hasHighInterestDebt: input.hasHighInterestDebt,
  }
  const { error } = await supabase.rpc('save_plan', {
    p: {
      scenario,
      goal: GOAL,
      monthly_amount: monthly,
      start_balance: quick ? 0 : input.currentSavings,
      months_estimated: monthsNoYield,
      months_with_yield: monthsWithYield,
      yield_rate_monthly: settings.yieldRate,
      target_date: monthsWithYield === null ? null : addMonths(new Date(), monthsWithYield).toISOString().slice(0, 10),
      recommended_blocks: plan.recommendedBlocks,
      ladder: plan.ladder,
      status: plan.status,
      inputs_snapshot: snapshot,
    },
  })
  if (error) throw error
  track('plan_created', { scenario, status: plan.status, months_bucket: monthsBucket(monthsNoYield) })
}
