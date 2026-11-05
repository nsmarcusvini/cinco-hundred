import { PLANS, TRIAL_DAYS, type PlanId } from '../../lib/plans'

/** O teste grátis é só do mensal e só da primeira assinatura. */
export const hasTrial = (plan: PlanId, firstSubscription: boolean) => plan === 'monthly' && firstSubscription

export function planCta(plan: PlanId, firstSubscription: boolean) {
  const { price, period } = PLANS[plan]
  return hasTrial(plan, firstSubscription) ? `Começar ${TRIAL_DAYS} dias grátis` : `Assinar por ${price}/${period}`
}

/** O que a pessoa precisa saber antes de ir para a Stripe: quando cobra e como cancelar. */
export function planTerms(plan: PlanId, firstSubscription: boolean) {
  const { price } = PLANS[plan]
  if (hasTrial(plan, firstSubscription)) {
    return `Pedimos o cartão agora, mas a primeira cobrança de ${price} só sai depois dos ${TRIAL_DAYS} dias. Cancele antes disso e nada é cobrado.`
  }
  return `Cobramos ${price} hoje. Você tem 7 dias para se arrepender e receber o valor de volta.`
}

export function PlanPicker({ value, onChange, firstSubscription }: {
  value: PlanId
  onChange: (plan: PlanId) => void
  firstSubscription: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Plano" className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(PLANS) as PlanId[]).map((id) => {
        const { name, price, period, note } = PLANS[id]
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`rounded-field border-2 p-4 text-left transition-colors duration-150 ${selected ? 'border-forest bg-forest/5' : 'border-line'}`}
          >
            <span className="block font-semibold">{name}</span>
            <span className="mt-1 block text-2xl font-extrabold tabular-nums">
              {price}<span className="text-base font-medium text-muted">/{period}</span>
            </span>
            <span className="mt-1 block text-sm text-muted">
              {id === 'monthly' && !firstSubscription ? 'Renova todo mês' : note}
            </span>
          </button>
        )
      })}
    </div>
  )
}
