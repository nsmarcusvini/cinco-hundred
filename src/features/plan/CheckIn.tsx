import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui'
import { toast } from '../../components/Toast'
import { formatBRL } from '../../lib/format'
import { belowHalfTwoMonths, computePlan, monthKey, type PlanInput } from '../../lib/plan'
import { useSettings, type PlanSnapshot, type Profile, type SavingsPlan } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { savePlan } from './savePlan'

/**
 * Check-in mensal (seção 6.8): no 1º acesso do mês pergunta se a renda ou os gastos mudaram.
 * Com 2 meses seguidos abaixo de 50% da meta, sugere o cenário Leve no lugar da pergunta.
 */
export function CheckIn({ plan, profile, savedByMonth }: {
  plan: SavingsPlan
  profile: Profile
  savedByMonth: Record<string, number>
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const [busy, setBusy] = useState(false)
  const now = new Date()
  const month = monthKey(now)
  const planStart = new Date(plan.created_at)
  // Plano feito neste mês já está atualizado.
  if (profile.last_checkin_month === month || planStart >= new Date(now.getFullYear(), now.getMonth(), 1)) return null

  const monthly = Number(plan.monthly_amount)
  const snapshot = plan.inputs_snapshot
  const input = snapshot && inputFromSnapshot(snapshot)
  const leve = input && settings ? computePlan(input, settings).scenarios.leve.monthly : null
  const suggestLeve = plan.scenario !== 'leve' && belowHalfTwoMonths(monthly, savedByMonth, planStart, now)
    && (leve === null || (leve > 0 && leve < monthly))

  async function answer(then?: () => void) {
    const key = ['profile', profile.id]
    qc.setQueryData<Profile>(key, (p) => p && { ...p, last_checkin_month: month })
    const { error } = await supabase.from('profiles').update({ last_checkin_month: month }).eq('id', profile.id)
    if (error) {
      qc.setQueryData<Profile>(key, (p) => p && { ...p, last_checkin_month: profile.last_checkin_month })
      return toast('Não foi possível salvar. Tente de novo.', 'error')
    }
    then?.()
  }

  async function switchToLeve() {
    if (!input || !settings) return answer(() => navigate('/onboarding?refazer'))
    setBusy(true)
    const result = computePlan(input, settings)
    try {
      await savePlan({ plan: result, input, scenario: 'leve', monthly: result.scenarios.leve.monthly, settings, quick: false })
    } catch {
      setBusy(false)
      return toast(profile.has_access
        ? 'Não foi possível mudar o plano. Tente de novo.'
        : 'No plano grátis dá para refazer o plano 1 vez por mês. Libere o acesso para refazer quando quiser.', 'error')
    }
    await qc.invalidateQueries({ queryKey: ['plan', profile.id] })
    await answer()
    setBusy(false)
    toast(`Pronto. Sua meta agora é ${formatBRL(result.scenarios.leve.monthly)} por mês.`)
  }

  return (
    <section aria-labelledby="checkin" className="rounded-field border-2 border-forest p-5">
      {suggestLeve ? (
        <>
          <h2 id="checkin" className="text-lg font-bold">Novo mês, hora de ajustar a meta?</h2>
          <p className="mt-2">
            Nos dois últimos meses deu para guardar menos da metade da meta. Acontece.{' '}
            {leve
              ? <>No cenário Leve a meta fica em <strong className="num">{formatBRL(leve)}</strong> por mês, e você sobe de novo quando quiser.</>
              : 'O cenário Leve deixa a meta mais folgada, e você sobe de novo quando quiser.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={switchToLeve}>Mudar para o Leve</Button>
            <Button variant="secondary" disabled={busy} onClick={() => answer()}>Manter {formatBRL(monthly)}</Button>
          </div>
          <Button variant="ghost" className="mt-1 px-0" disabled={busy} onClick={() => answer(() => navigate('/onboarding?refazer'))}>
            Minha renda ou meus gastos mudaram
          </Button>
        </>
      ) : (
        <>
          <h2 id="checkin" className="text-lg font-bold">Novo mês, nova meta: <span className="num">{formatBRL(monthly)}</span></h2>
          <p className="mt-2">Sua renda ou seus gastos mudaram?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => answer()}>Não</Button>
            <Button onClick={() => answer(() => navigate('/onboarding?refazer'))}>Sim, atualizar</Button>
          </div>
        </>
      )}
    </section>
  )
}

/** Refaz a entrada do plano a partir do resumo salvo (totais no lugar das categorias). */
function inputFromSnapshot(s: PlanSnapshot): PlanInput {
  return {
    income: s.income,
    fixed: [{ category: 'fixos', amount: s.fixos }],
    variable: s.variableEstimated ? null : [{ category: 'variaveis', amount: s.variaveis }],
    currentSavings: s.currentSavings,
    hasEmergencyFund: s.hasEmergencyFund,
    hasHighInterestDebt: s.hasHighInterestDebt,
  }
}
