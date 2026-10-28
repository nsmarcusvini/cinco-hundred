import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Sheet } from '../components/Sheet'
import { toast } from '../components/Toast'
import { AnimatedBRL } from '../components/AnimatedBRL'
import { Button, GridPreview } from '../components/ui'
import { joinByCode } from '../features/challenges/join'
import { useMovements } from '../features/movements/api'
import { useChallenges, type ChallengeSummary } from '../features/challenges/api'
import { totalOf } from '../lib/blocks'
import { goalIcon, goalLabel } from '../lib/goals'
import { formatBRL } from '../lib/format'
import { monthStatus } from '../lib/plan'
import { useActivePlan, useProfile, useSavedByMonth } from '../lib/queries'

export default function Home() {
  const { data: profile } = useProfile()
  const { data: plan } = useActivePlan()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: savedByMonth } = useSavedByMonth(monthStart)
  const { data: challenges, isPending } = useChallenges()
  const totalSaved = challenges?.reduce((t, c) => t + c.saved, 0) ?? 0
  const [codeOpen, setCodeOpen] = useState(false)
  const { data: movements } = useMovements()

  return (
    <div className="space-y-8 py-6">
      {plan ? (
        <PlanCard monthly={Number(plan.monthly_amount)} saved={Object.values(savedByMonth ?? {}).reduce((a, b) => a + b, 0)}
          goal={profile && goalLabel(profile.savings_goal, profile.savings_goal_other)} icon={goalIcon(profile?.savings_goal ?? null)} />
      ) : (
        <Link to="/onboarding?refazer" className="block rounded-field border-2 border-line p-4">
          <strong className="block">Monte seu plano</strong>
          <span className="text-muted">Descubra quanto guardar por mês para chegar aos R$ 125.250.</span>
        </Link>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold">Seus desafios</h2>
          {!!challenges?.length && (
            <p className="text-sm text-muted">Total guardado <AnimatedBRL value={totalSaved} className="font-bold text-ink" /></p>
          )}
        </div>
        {isPending && <div className="h-24 rounded-field bg-line/50" aria-hidden />}
        {challenges?.length === 0 && (
          <div className="rounded-field border-2 border-dashed border-line p-5">
            <p>Você ainda não tem desafios.</p>
            {plan?.recommended_blocks && (
              <div className="mt-4 max-w-72"><GridPreview blocks={plan.recommended_blocks} /></div>
            )}
          </div>
        )}
        <ul className="space-y-3">
          {challenges?.map((c) => <ChallengeCard key={c.id} c={c} />)}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={profile?.has_access ? '/app/novo' : '/app/acesso'}
            className="inline-flex min-h-12 items-center rounded-field bg-forest px-5 font-semibold text-cream">
            {profile?.has_access ? '+ Novo desafio' : 'Liberar acesso'}
          </Link>
          <Button variant="secondary" onClick={() => setCodeOpen(true)}>Entrar com código</Button>
        </div>
      </section>
      {!!movements?.length && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Movimentos</h2>
          <ul className="space-y-2">
            {movements.map((m) => (
              <li key={m.id}>
                <Link to={`/m/${m.slug}`} className="flex items-center gap-3 rounded-field border-2 border-line p-4 active:bg-line/30">
                  <span className="flex-1">
                    <strong className="block">{m.title}</strong>
                    <span className="text-sm text-muted">
                      {m.participants === 1 ? '1 pessoa participando' : `${m.participants.toLocaleString('pt-BR')} pessoas participando`}
                      {m.starts_at && new Date(m.starts_at) > new Date() &&
                        `, começa ${new Date(m.starts_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`}
                    </span>
                  </span>
                  <span aria-hidden className="text-xl text-forest">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} name={profile?.display_name ?? ''} />
    </div>
  )
}

function CodeSheet({ open, onClose, name }: { open: boolean; onClose: () => void; name: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await joinByCode(code, name)
    setBusy(false)
    if (r.ok) {
      await qc.invalidateQueries({ queryKey: ['challenges'] })
      return navigate(`/app/d/${r.id}`)
    }
    if (r.needsAccess) return navigate('/app/acesso')
    toast(r.message, 'error')
  }

  return (
    <Sheet open={open} onOpenChange={onClose} title="Entrar com código">
      <form onSubmit={submit}>
        <label htmlFor="code" className="mb-2 block text-muted">O código tem 6 letras e números. Ele está no convite.</label>
        <input id="code" autoFocus required maxLength={6} autoComplete="off" autoCapitalize="characters" value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, ''))}
          className="num w-full border-b-2 border-line bg-transparent py-1 text-3xl font-extrabold tracking-[0.2em] uppercase outline-none focus:border-forest" />
        <Button type="submit" className="mt-6 w-full" disabled={busy || code.length !== 6}>Entrar no desafio</Button>
      </form>
    </Sheet>
  )
}

function ChallengeCard({ c }: { c: ChallengeSummary }) {
  const goal = totalOf(c.blocks)
  const pct = (c.saved / goal) * 100
  return (
    <li>
      <Link to={`/app/d/${c.id}`} className="block rounded-field border-2 border-line p-4 active:bg-line/30">
        <div className="flex items-baseline gap-3">
          <strong className="flex-1">{c.title}</strong>
          {c.type !== 'solo' && <span className="rounded-[3px] bg-forest px-2 py-0.5 text-xs font-semibold text-cream">em grupo</span>}
          {c.status === 'completed' && <span className="rounded-[3px] bg-gold px-2 py-0.5 text-xs font-semibold text-forest">completo</span>}
        </div>
        <p className="mt-1">
          <span className="num text-xl font-extrabold">{formatBRL(c.saved)}</span>{' '}
          <span className="num text-sm text-muted">de {formatBRL(goal)}</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-[3px] bg-line">
          <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
        <p className="num mt-1 text-xs text-muted">{Math.floor(pct)}%, {c.marked} de {c.blocks} blocos</p>
      </Link>
    </li>
  )
}

function PlanCard({ monthly, saved, goal, icon }: { monthly: number; saved: number; goal: string | null | undefined; icon: string }) {
  const now = new Date()
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const status = monthStatus(monthly, saved, now.getDate(), days)
  const pct = monthly > 0 ? Math.min(100, Math.round((saved / monthly) * 100)) : 0
  const statusText = {
    em_dia: 'Em dia',
    adiantado: 'Meta do mês batida',
    atrasado: `Faltam ${formatBRL(Math.max(0, monthly - saved))} para a meta do mês`,
  }[status]
  return (
    <Link to="/app/plano" className="block rounded-field bg-forest p-5 text-cream">
      {goal && <p className="mb-2 text-sm font-semibold"><span aria-hidden>{icon}</span> {goal}</p>}
      <p className="text-cream/80">Meta deste mês: <span className="num">{formatBRL(monthly)}</span></p>
      <p className="mt-1"><AnimatedBRL value={saved} className="text-3xl font-extrabold" /> <span className="text-cream/80">guardados ({pct}%)</span></p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-[3px] bg-cream/20">
        <div className="h-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm font-semibold">{statusText}</p>
    </Link>
  )
}
