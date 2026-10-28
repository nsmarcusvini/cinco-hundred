import { Link } from 'react-router'
import { formatBRL, formatDuration, formatMonthYear } from '../../lib/format'
import { computePlan, GOAL, type PlanResult } from '../../lib/plan'
import { goalIcon, goalLabel } from '../../lib/goals'
import { useActivePlan, useProfile, useSavedByMonth, useSettings, type SavingsPlan } from '../../lib/queries'
import { AnimatedBRL } from '../../components/AnimatedBRL'
import { DISCLAIMER, Ladder, Milestones, Priorities } from './pieces'

export default function PlanPage() {
  const { data: plan, isPending } = useActivePlan()
  const { data: settings } = useSettings()
  const { data: savedByMonth } = useSavedByMonth(plan?.created_at)
  const { data: profile } = useProfile()
  const goal = profile ? goalLabel(profile.savings_goal, profile.savings_goal_other) : null

  if (isPending || !settings) return <PlanSkeleton />
  if (!plan) {
    return (
      <div className="py-10">
        <h1 className="text-xl font-bold">Você ainda não montou seu plano</h1>
        <p className="mt-2 text-muted">Em 2 minutos você descobre quanto guardar por mês e quando chega aos {formatBRL(GOAL)}.</p>
        <Link to="/onboarding?refazer" className="mt-6 inline-flex min-h-12 items-center rounded-field bg-forest px-5 font-semibold text-cream">
          Montar meu plano
        </Link>
      </div>
    )
  }

  const snap = plan.inputs_snapshot
  const result: PlanResult | null = snap
    ? computePlan({
        income: snap.income,
        fixed: [{ category: 'outros', amount: snap.fixos }],
        variable: [{ category: 'outros', amount: snap.variaveis }],
        currentSavings: snap.currentSavings,
        hasEmergencyFund: snap.hasEmergencyFund,
        hasHighInterestDebt: snap.hasHighInterestDebt,
      }, settings)
    : null
  const monthly = Number(plan.monthly_amount)
  const start = Number(plan.start_balance)
  const rate = Number(plan.yield_rate_monthly ?? settings.yieldRate)

  return (
    <div className="space-y-10 py-6">
      <header>
        {goal && (
          <p className="mb-3 inline-flex items-center gap-2 rounded-field bg-forest px-3 py-1.5 text-sm font-semibold text-cream">
            <span aria-hidden>{goalIcon(profile!.savings_goal)}</span> {goal}
          </p>
        )}
        <p className="text-muted">Sugestão para guardar por mês</p>
        <AnimatedBRL value={monthly} className="block text-4xl font-extrabold" />
        <p className="mt-1 text-muted">Guarde do seu jeito: de uma vez, por semana ou um bloco sempre que der.</p>
        {plan.months_estimated !== null && (
          <p className="mt-1">
            Meta de {formatBRL(GOAL)} em {formatDuration(plan.months_estimated)}
            {plan.target_date && <>, com rendimento por volta de {formatMonthYear(new Date(plan.target_date + 'T12:00'))}</>}.
          </p>
        )}
      </header>

      <Section title="Planejado e guardado">
        <ProjectionChart plan={plan} rate={rate} savedByMonth={savedByMonth ?? {}} />
      </Section>

      {result && (
        <Section title="Para onde vai seu dinheiro">
          <MoneyFlow plan={result} monthly={monthly} estimated={snap!.variableEstimated} />
        </Section>
      )}

      <Section title="Marcos">
        <Milestones plan={result ?? { emergencyTarget: null } as PlanResult} monthly={monthly} currentSavings={start} yieldRate={rate} />
        <p className="mt-2 text-xs text-muted">
          Datas estimadas com rendimento de referência de {(rate * 100).toLocaleString('pt-BR')}% a.m., não é garantia.
        </p>
      </Section>

      {plan.ladder && (
        <Section title="Escada de desafios">
          <Ladder ladder={plan.ladder} />
        </Section>
      )}

      {result && snap && (
        <Section title="Prioridades">
          <Priorities plan={result} monthly={monthly} currentSavings={start} yieldRate={rate} hasDebt={snap.hasHighInterestDebt} />
        </Section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link to="/onboarding?refazer" className="inline-flex min-h-12 items-center rounded-field bg-forest px-5 font-semibold text-cream">
          Refazer plano
        </Link>
        {snap && (
          <Link to="/onboarding?refazer" className="inline-flex min-h-12 items-center rounded-field border-2 border-forest px-5 font-semibold text-forest">
            Editar renda e gastos
          </Link>
        )}
      </div>

      <p className="text-xs text-muted">{DISCLAIMER}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function PlanSkeleton() {
  return (
    <div className="space-y-4 py-6" aria-hidden>
      <div className="h-5 w-32 rounded-block bg-line/60" />
      <div className="h-12 w-56 rounded-block bg-line/60" />
      <div className="h-44 rounded-block bg-line/60" />
    </div>
  )
}

/** Barra empilhada: renda → fixos → variáveis → aporte → folga. */
function MoneyFlow({ plan, monthly, estimated }: { plan: PlanResult; monthly: number; estimated: boolean }) {
  const folga = Math.max(0, plan.sobra - monthly)
  const parts = [
    { label: 'Gastos fixos', value: plan.fixos, cls: 'bg-ink' },
    { label: estimated ? 'Gastos variáveis (estimado)' : 'Gastos variáveis', value: plan.variaveis, cls: 'bg-muted' },
    { label: 'Guardar no desafio', value: Math.min(monthly, Math.max(0, plan.sobra)), cls: 'bg-leaf' },
    { label: 'Folga para imprevistos', value: folga, cls: 'bg-gold' },
  ].filter((p) => p.value > 0)
  const total = Math.max(plan.income, plan.fixos + plan.variaveis)
  return (
    <div>
      <p className="mb-2">Renda de <strong className="num">{formatBRL(plan.income)}</strong> por mês</p>
      <div className="flex h-6 overflow-hidden rounded-block" aria-hidden>
        {parts.map((p) => <span key={p.label} className={p.cls} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 space-y-1">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-3">
            <span className={`size-3 rounded-[3px] ${p.cls}`} aria-hidden />
            <span className="flex-1">{p.label}</span>
            <span className="num font-semibold">{formatBRL(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Linha planejada (com rendimento de referência) × linha guardada (blocos marcados desde o plano). */
function ProjectionChart({ plan, rate, savedByMonth }: { plan: SavingsPlan; rate: number; savedByMonth: Record<string, number> }) {
  const monthly = Number(plan.monthly_amount)
  const horizon = Math.max(12, plan.months_with_yield ?? plan.months_estimated ?? 12)
  const planned: number[] = [Number(plan.start_balance)]
  for (let i = 1; i <= horizon; i++) planned.push(Math.min(GOAL, planned[i - 1] * (1 + rate) + monthly))

  const start = new Date(plan.created_at)
  const real: number[] = [Number(plan.start_balance)]
  const now = new Date()
  const elapsed = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
  for (let i = 0; i <= elapsed; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    real.push(real[real.length - 1] + (savedByMonth[key] ?? 0))
  }

  const W = 320, H = 160
  const x = (i: number) => (i / horizon) * W
  const y = (v: number) => H - (v / GOAL) * H
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const saved = real[real.length - 1]

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full overflow-visible" role="img"
        aria-label={`Planejado: ${formatBRL(GOAL)} em ${horizon} meses. Guardado até agora: ${formatBRL(saved)}.`}>
        <line x1="0" y1={H} x2={W} y2={H} className="stroke-line" />
        <path d={path(planned)} fill="none" className="stroke-forest" strokeWidth="2" strokeDasharray="4 4" />
        <path d={path(real)} fill="none" className="stroke-leaf" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <figcaption className="mt-2 flex gap-5 text-xs">
        <span className="flex items-center gap-2"><span className="h-0.5 w-5 border-t-2 border-dashed border-forest" />Planejado</span>
        <span className="flex items-center gap-2"><span className="h-1 w-5 rounded bg-leaf" />Guardado: <span className="num font-semibold">{formatBRL(saved)}</span></span>
      </figcaption>
    </figure>
  )
}
