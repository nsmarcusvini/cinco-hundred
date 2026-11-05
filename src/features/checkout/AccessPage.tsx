import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Button, GridPreview } from '../../components/ui'
import { track } from '../../lib/analytics'
import type { PlanId } from '../../lib/plans'
import { paymentFailed, useActivePlan, useProfile, useSubscription } from '../../lib/queries'
import { PlanPicker, planCta, planTerms } from './PlanPicker'
import { openPortal, startCheckout } from './startCheckout'

export const INCLUDED = [
  'Até 20 desafios, de 10 a 1000 blocos',
  'Desafios em dupla ou grupo, com até 8 pessoas',
  'Movimentos com ranking',
  'Lembretes no dia do salário',
  'Card de progresso para os stories',
]

/** /app/acesso */
export default function AccessPage() {
  const { data: profile } = useProfile()
  const { data: plan } = useActivePlan()
  const { data: subscription } = useSubscription()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<PlanId>('monthly')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    track(params.has('cancelado') ? 'checkout_canceled' : 'access_offer_view', { from: 'acesso' })
  }, [params])

  if (profile?.has_access) return <Navigate to="/app" replace />

  if (paymentFailed(subscription)) {
    return (
      <div className="space-y-4 py-6">
        <h1 className="text-xl font-bold">Não conseguimos cobrar seu cartão</h1>
        <p className="text-muted">Atualize a forma de pagamento para liberar seu acesso de novo. Até lá, seus desafios ficam só para consulta.</p>
        <Button className="w-full" disabled={busy} onClick={async () => {
          setBusy(true)
          if (!(await openPortal())) setBusy(false)
        }}>{busy ? 'Abrindo…' : 'Atualizar pagamento'}</Button>
      </div>
    )
  }

  const firstSubscription = !subscription

  async function subscribe() {
    setBusy(true)
    if ((await startCheckout('acesso', selected)) !== 'redirecting') setBusy(false)
  }

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold">Escolha seu plano</h1>
        <p className="mt-1 text-muted">Renovação automática. Cancele quando quiser em Configurações.</p>
      </div>
      <PlanPicker value={selected} onChange={setSelected} firstSubscription={firstSubscription} />
      <GridPreview blocks={plan?.recommended_blocks ?? 500} />
      <ul className="space-y-2">
        {INCLUDED.map((t) => (
          <li key={t} className="flex gap-3"><span className="mt-1.5 size-3 shrink-0 rounded-[3px] bg-leaf" aria-hidden />{t}</li>
        ))}
      </ul>
      <Button className="w-full" disabled={busy} onClick={subscribe}>
        {busy ? 'Abrindo o pagamento…' : planCta(selected, firstSubscription)}
      </Button>
      <p className="text-xs text-muted">
        {planTerms(selected, firstSubscription)} Você paga na página segura da Stripe. Tem cupom? O campo fica lá.
      </p>
    </div>
  )
}
