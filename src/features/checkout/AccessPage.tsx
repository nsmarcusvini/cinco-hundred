import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Button, GridPreview } from '../../components/ui'
import { track } from '../../lib/analytics'
import { useActivePlan, useProfile, useSettings } from '../../lib/queries'
import { startCheckout } from './startCheckout'

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
  const { data: settings } = useSettings()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    track(params.has('cancelado') ? 'checkout_canceled' : 'access_offer_view', { from: 'acesso' })
  }, [params])

  if (profile?.has_access) return <Navigate to="/app" replace />
  const price = settings?.priceLabel ?? 'R$ 10'

  async function buy() {
    setBusy(true)
    if ((await startCheckout('acesso')) !== 'redirecting') setBusy(false)
  }

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-xl font-bold">Acesso vitalício por {price}</h1>
        <p className="mt-1 text-muted">Pagamento único, sem mensalidade.</p>
      </div>
      <GridPreview blocks={plan?.recommended_blocks ?? 500} />
      <ul className="space-y-2">
        {INCLUDED.map((t) => (
          <li key={t} className="flex gap-3"><span className="mt-1.5 size-3 shrink-0 rounded-[3px] bg-leaf" aria-hidden />{t}</li>
        ))}
      </ul>
      <Button className="w-full" disabled={busy} onClick={buy}>{busy ? 'Abrindo o pagamento…' : `Liberar por ${price}`}</Button>
      <p className="text-xs text-muted">
        Você paga na página segura da Stripe. Tem cupom? O campo fica lá. Direito de arrependimento em até 7 dias.
      </p>
    </div>
  )
}
