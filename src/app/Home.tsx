import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Sheet } from '../components/Sheet'
import { Tour, useFinishTour, type TourStep } from '../components/Tour'
import { toast } from '../components/Toast'
import { AnimatedBRL } from '../components/AnimatedBRL'
import { Button, GridPreview } from '../components/ui'
import { joinByCode } from '../features/challenges/join'
import { useMovements } from '../features/movements/api'
import { useChallenges, type ChallengeSummary } from '../features/challenges/api'
import { totalOf } from '../lib/blocks'
import { goalIcon, goalLabel } from '../lib/goals'
import { formatBRL } from '../lib/format'
import { monthKey, monthStatus } from '../lib/plan'
import { CheckIn } from '../features/plan/CheckIn'
import { useActivePlan, useProfile, useSavedByMonth } from '../lib/queries'

export default function Home() {
  const { data: profile } = useProfile()
  const { data: plan } = useActivePlan()
  const now = new Date()
  // Mês atual e os dois anteriores (o check-in olha os dois meses fechados).
  const since = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString()
  const { data: savedByMonth } = useSavedByMonth(since)
  const { data: challenges, isPending } = useChallenges()
  const totalSaved = challenges?.reduce((t, c) => t + c.saved, 0) ?? 0
  const [codeOpen, setCodeOpen] = useState(false)
  const { data: movements, isPending: movementsPending } = useMovements()
  // Movimento de que a pessoa já participa (como dona ou por convite): o card leva direto para a grade.
  const mineByMovement = new Map(challenges?.filter((c) => c.movement_id).map((c) => [c.movement_id, c.id]))
  const [params, setParams] = useSearchParams()
  const finishTour = useFinishTour()
  const [tourOpen, setTourOpen] = useState(true)
  // Primeira visita depois do cadastro, ou "Ver o tutorial de novo" (Configurações). Espera a tela carregar para achar os elementos.
  const showTour = tourOpen && !!profile && !isPending && !movementsPending && (params.has('tutorial') || !profile.tour_done_at)
  const closeTour = () => {
    setTourOpen(false)
    if (!profile?.tour_done_at) finishTour()
    if (params.has('tutorial')) setParams({}, { replace: true })
  }

  return (
    <div className="space-y-8 py-6">
      {plan && profile && savedByMonth && <CheckIn plan={plan} profile={profile} savedByMonth={savedByMonth} />}
      <div data-tour="plan">
      {plan ? (
        <PlanCard monthly={Number(plan.monthly_amount)} saved={savedByMonth?.[monthKey(now)] ?? 0}
          goal={profile && goalLabel(profile.savings_goal, profile.savings_goal_other)} icon={goalIcon(profile?.savings_goal ?? null)} />
      ) : (
        <Link to="/onboarding?refazer" className="block rounded-field border-2 border-line p-4">
          <strong className="block">Monte seu plano</strong>
          <span className="text-muted">Descubra quanto guardar por mês para chegar aos R$ 125.250.</span>
        </Link>
      )}
      </div>

      <section>
        <div data-tour="challenges" className="mb-3 flex items-baseline justify-between gap-4">
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
          <Link data-tour="new-challenge" to={profile?.has_access ? '/app/novo' : '/app/acesso'}
            className="inline-flex min-h-12 items-center rounded-field bg-forest px-5 font-semibold text-cream">
            {profile?.has_access ? '+ Novo desafio' : 'Liberar acesso'}
          </Link>
          <Button data-tour="join-code" variant="secondary" onClick={() => setCodeOpen(true)}>Entrar com código</Button>
        </div>
      </section>
      {!!movements?.length && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Movimentos</h2>
          <ul className="space-y-2">
            {movements.map((m) => {
              const mine = mineByMovement.get(m.id)
              return (
                <li key={m.id} data-tour={`movement-${m.slug}`}>
                  <Link to={mine ? `/app/d/${mine}` : `/m/${m.slug}`}
                    className={`flex items-center gap-3 rounded-field border-2 p-4 active:bg-line/30 ${mine ? 'border-leaf' : 'border-line'}`}>
                    <span className="flex-1">
                      <strong className="block">{m.title}</strong>
                      {mine && <span className="mt-1 inline-block rounded-[3px] bg-leaf px-2 py-0.5 text-xs font-semibold text-cream">Você participa</span>}
                      <span className="block text-sm text-muted">
                        {m.participants === 1 ? '1 pessoa participando' : `${m.participants.toLocaleString('pt-BR')} pessoas participando`}
                        {m.starts_at && new Date(m.starts_at) > new Date() &&
                          `, começa ${new Date(m.starts_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`}
                      </span>
                    </span>
                    <span aria-hidden className="text-xl text-forest">›</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {showTour && <Tour steps={homeTour(!!profile.has_access)} onClose={closeTour} />}
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

/** Tutorial da Início: um passo por parte do app. Passos sem elemento na tela são pulados. */
function homeTour(hasAccess: boolean): TourStep[] {
  return [
    {
      target: 'plan', title: 'Sua meta do mês',
      body: 'Aqui fica quanto o seu plano sugere guardar no mês e quanto você já marcou. Guarde do seu jeito: o card mostra se você está em dia.',
    },
    {
      target: 'challenges', title: 'Seus desafios',
      body: 'Cada desafio é uma grade de blocos numerados. Guardou R$ 37? Abra o desafio e marque o bloco 37. O total e a porcentagem sobem na hora.',
    },
    {
      target: 'new-challenge', title: 'Crie um desafio',
      body: hasAccess
        ? 'Escolha de 10 a 1000 blocos, dê um nome e, se quiser, um prazo. O desafio pode ser só seu, em dupla ou em grupo.'
        : 'Com o acesso vitalício (R$ 10, uma vez só) você cria desafios de 10 a 1000 blocos, só seus, em dupla ou em grupo.',
    },
    {
      target: 'new-challenge', title: 'Em dupla ou em grupo',
      body: 'Escolha Em dupla ou Em grupo (até 8 pessoas) e mande o convite. Cada pessoa guarda na própria conta e marca com a sua cor na mesma grade. O ranking do grupo mostra quanto cada um guardou.',
    },
    {
      target: 'join-code', title: 'Recebeu um convite?',
      body: 'Quem te chamou manda um link ou um código de 6 letras e números. Toque aqui e digite o código para entrar no desafio.',
    },
    {
      target: 'movement-desafio-500', title: 'Desafio 500',
      body: '500 blocos, de R$ 1 a R$ 500: R$ 125.250 no fim. É um movimento: todo mundo começa junto e o ranking é por porcentagem, nunca por valor.',
    },
    {
      target: 'movement-100-dias', title: 'Desafio 100 dias',
      body: '100 blocos, R$ 5.050 no fim. É o primeiro degrau para criar o hábito antes dos desafios maiores.',
    },
    {
      target: 'movement-100-mil-com-um-amigo', title: 'Junte 100 mil com um amigo ou família',
      body: 'Chame uma pessoa e completem juntos 447 blocos: R$ 100.128 no fim. Cada um guarda na própria conta e marca com a sua cor na mesma grade. Com duas pessoas guardando, o prazo cai pela metade.',
    },
    { target: 'nav-plano', title: 'Seu plano', body: 'Quanto guardar por mês, quando você chega lá e os marcos do caminho.' },
    { target: 'nav-ranking', title: 'Ranking', body: 'O ranking geral de quem mais guardou. Só aparece quem escolheu aparecer.' },
    { target: 'nav-config', title: 'Configurações', body: 'Lembretes, privacidade, seu acesso e o botão para ver este tutorial de novo.' },
  ]
}
