import { addMonths, blocksPace, milestones, monthsToReach, GOAL, type PlanResult, type ScenarioKey } from '../../lib/plan'
import { formatBRL, formatDuration, formatMonthYear } from '../../lib/format'

const SCENARIO_LABEL: Record<ScenarioKey, string> = { leve: 'Leve', recomendado: 'Recomendado', acelerado: 'Acelerado' }

export const BLOCK_TOTAL: Record<number, number> = { 100: 5050, 250: 31375, 500: 125250 }

const TIPS: Record<string, string> = {
  moradia: 'Moradia: renegociar o aluguel ou dividir custos costuma ser o maior alívio.',
  contas_casa: 'Contas da casa: compare planos de internet e celular; trocar de plano reduz a conta sem esforço.',
  mercado: 'Mercado: lista fechada e compra do mês evitam idas extras ao mercado.',
  transporte: 'Transporte: some combustível, aplicativo e estacionamento; às vezes o transporte público sai mais barato.',
  saude: 'Saúde: confira se o plano atual cobre só o que você usa.',
  educacao: 'Educação: procure bolsas ou descontos para pagamento à vista.',
  dividas_parcelas: 'Dívidas: troque dívida cara por uma mais barata (portabilidade ou consignado) e evite novas parcelas.',
  assinaturas: 'Assinaturas: cancele as que você não abriu no último mês.',
  filhos_pets: 'Filhos e pets: planeje compras grandes com antecedência para aproveitar promoções.',
  lazer: 'Lazer: defina um valor fixo por mês e guarde o que sobrar.',
  delivery_restaurante: 'Delivery: um teto semanal para pedidos já faz diferença no fim do mês.',
  compras: 'Compras: espere 48 horas antes de comprar o que não é essencial.',
  outros: 'Outros: anote por uma semana para onde vão os gastos pequenos.',
}

export function ScenarioPicker({
  plan, value, customMonthly, onChange, onCustom,
}: {
  plan: PlanResult
  value: ScenarioKey | 'personalizado'
  customMonthly: number | null
  onChange: (key: ScenarioKey) => void
  onCustom: (monthly: number) => void
}) {
  const max = Math.max(10, Math.floor(plan.sobra / 10) * 10)
  const current = value === 'personalizado' ? customMonthly ?? 0 : plan.scenarios[value].monthly
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Cenário de aporte" className="divide-y divide-line rounded-field border-2 border-line">
        {(Object.keys(SCENARIO_LABEL) as ScenarioKey[]).map((key) => {
          const s = plan.scenarios[key]
          const selected = value === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(key)}
              className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-150 ${
                selected ? 'bg-forest text-cream' : ''
              }`}
            >
              <span className="flex-1">
                <span className="num block text-xl font-extrabold">{formatBRL(s.monthly)}</span>
                <span className={`text-xs ${selected ? 'text-cream/80' : 'text-muted'}`}>
                  {SCENARIO_LABEL[key]}, {formatBRL(s.weekly)} por semana
                </span>
              </span>
              <span className="text-right text-xs">
                {s.monthsNoYield === null ? 'sem prazo' : formatDuration(s.monthsNoYield)}
              </span>
            </button>
          )
        })}
      </div>
      <label className="block pt-2 text-xs text-muted">
        Ajustar o valor: <span className="num font-bold text-ink">{formatBRL(current)}</span> por mês
        <input
          type="range"
          min={10}
          max={max}
          step={10}
          value={Math.min(current, max)}
          onChange={(e) => onCustom(Number(e.target.value))}
          className="mt-2 w-full accent-forest"
        />
      </label>
    </div>
  )
}

/** Prazo e data previstos para o aporte escolhido. */
export function Forecast({ monthly, currentSavings, yieldRate, goal = GOAL }: {
  monthly: number; currentSavings: number; yieldRate: number; goal?: number
}) {
  const noYield = monthsToReach(goal, currentSavings, monthly, 0)
  const withYield = monthsToReach(goal, currentSavings, monthly, yieldRate)
  const pace = blocksPace(monthly)
  if (noYield === null) return <p className="text-muted">Com esse valor não há prazo para a meta. Ajuste o aporte acima.</p>
  return (
    <div className="space-y-1">
      <p>
        Você chega a <strong className="num">{formatBRL(goal)}</strong> em{' '}
        <strong>{formatDuration(noYield)}</strong>, em {formatMonthYear(addMonths(new Date(), noYield))}.
      </p>
      {withYield !== null && withYield < noYield && (
        <p className="text-xs text-muted">
          Com rendimento, cerca de {formatDuration(withYield)} ({formatMonthYear(addMonths(new Date(), withYield))}).
          Estimativa com rendimento de referência de {(yieldRate * 100).toLocaleString('pt-BR')}% a.m., não é garantia.
        </p>
      )}
      <p className="text-xs text-muted">
        São cerca de {Math.max(1, Math.round(pace.perMonth))} blocos por mês (≈ {Math.max(1, Math.round(pace.perWeek))} por semana).
      </p>
    </div>
  )
}

/** Checklist de prioridades: dívida → reserva → meta. */
export function Priorities({ plan, monthly, currentSavings, yieldRate, hasDebt }: {
  plan: PlanResult; monthly: number; currentSavings: number; yieldRate: number; hasDebt: boolean
}) {
  const reserveMonth = plan.emergencyTarget ? monthsToReach(plan.emergencyTarget, currentSavings, monthly, yieldRate) : null
  return (
    <ol className="space-y-3">
      {hasDebt && (
        <li className="rounded-field bg-gold/25 p-4">
          <strong className="block">Primeiro: as dívidas caras</strong>
          Juros de cartão e cheque especial costumam ser maiores que qualquer rendimento. Considere quitar essas dívidas
          antes de acelerar o desafio. Até lá, o cenário Leve é o mais seguro.
        </li>
      )}
      {plan.emergencyTarget !== null && (
        <li className="rounded-field border-2 border-line p-4">
          <strong className="block">Reserva de emergência: {formatBRL(plan.emergencyTarget)}</strong>
          Os primeiros {formatBRL(plan.emergencyTarget)} dos seus blocos formam sua reserva de emergência. Deixe essa parte
          com liquidez diária.
          {reserveMonth !== null && reserveMonth > 0 && (
            <> Previsão: {formatMonthYear(addMonths(new Date(), reserveMonth))}.</>
          )}
        </li>
      )}
      <li className="rounded-field border-2 border-line p-4">
        <strong className="block">Depois: rumo aos {formatBRL(GOAL)}</strong>
        Cada bloco marcado é dinheiro que já está guardado na sua conta ou investimento.
      </li>
    </ol>
  )
}

/** Escada de desafios como trilha de blocos. */
export function Ladder({ ladder }: { ladder: number[] }) {
  return (
    <ol className="flex items-end gap-3" aria-label="Escada de desafios">
      {ladder.map((blocks, i) => (
        <li key={blocks} className="flex flex-col items-start gap-1">
          <span
            className={`rounded-block ${i === 0 ? 'bg-leaf' : 'bg-line'}`}
            style={{ width: 28 + i * 14, height: 28 + i * 14 }}
            aria-hidden
          />
          <span className="text-xs font-semibold">{blocks} blocos</span>
          <span className="num text-xs text-muted">{formatBRL(BLOCK_TOTAL[blocks] ?? (blocks * (blocks + 1)) / 2)}</span>
        </li>
      ))}
    </ol>
  )
}

/** Plano em resgate: para onde o dinheiro está indo + 3 dicas. */
export function Rescue({ plan }: { plan: PlanResult }) {
  return (
    <div className="space-y-3">
      <p>
        Seu primeiro objetivo é criar folga no orçamento. Hoje seus gastos somam{' '}
        <strong className="num">{formatBRL(plan.fixos + plan.variaveis)}</strong> para uma renda de{' '}
        <strong className="num">{formatBRL(plan.income)}</strong>.
      </p>
      <ul className="space-y-2 text-sm">
        {plan.topCategories.map((c) => (
          <li key={c.category} className="rounded-field border-2 border-line p-3">
            <span className="num block font-bold">{formatBRL(c.amount)}</span>
            {TIPS[c.category] ?? TIPS.outros}
          </li>
        ))}
      </ul>
      <p>Comece pelo Desafio 100 blocos (R$ 5.050), marcando primeiro os blocos pequenos.</p>
    </div>
  )
}

export function Milestones({ plan, monthly, currentSavings, yieldRate }: {
  plan: PlanResult; monthly: number; currentSavings: number; yieldRate: number
}) {
  const label = { reserva: 'Reserva de emergência', '25': '25% da meta', '50': '50% da meta', '100mil': 'R$ 100 mil', meta: 'Meta' }
  return (
    <ul className="space-y-2">
      {milestones(plan, monthly, currentSavings, yieldRate).map((m) => (
        <li key={m.key} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
          <span>
            {label[m.key]}
            <span className="num block text-xs text-muted">{formatBRL(m.amount)}</span>
          </span>
          <span className="text-sm font-semibold">
            {m.month === null ? '—' : m.month === 0 ? 'já atingido' : formatMonthYear(addMonths(new Date(), m.month))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export const DISCLAIMER =
  'Este plano é uma simulação educativa baseada nas informações que você informou. Não é recomendação de investimento.'
