import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, m } from 'motion/react'
import {
  useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { MotionProvider } from '../../components/MotionProvider'
import { CdiMagic } from '../../components/CdiMagic'
import { StepBlocks } from '../../components/StepBlocks'
import { toast } from '../../components/Toast'
import { AnimatedBRL } from '../../components/AnimatedBRL'
import { Button, Choice, CurrencyInput, GridPreview } from '../../components/ui'
import { track } from '../../lib/analytics'
import { GOALS, type SavingsGoal } from '../../lib/goals'
import { getPending, pendingPath } from '../../lib/pending'
import { enablePush, PUSH_MESSAGES } from '../../lib/push'
import { INCLUDED } from '../checkout/AccessPage'
import { startCheckout } from '../checkout/startCheckout'
import { formatBRL, formatDuration, formatMonthYear } from '../../lib/format'
import { addMonths, computePlan, GOAL, monthsToReach, monthsWithPartner, validatePlanInput } from '../../lib/plan'
import { useProfile, useSettings, type AppSettings, type Profile } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { useUserId } from '../auth/AuthProvider'
import { BLOCK_TOTAL, DISCLAIMER, FlexibleSuggestion, Forecast, Ladder, Priorities, Rescue, ScenarioPicker } from '../plan/pieces'
import { savePlan } from '../plan/savePlan'
import {
  clearLocalDraft, emptyDraft, FIXED_CATEGORIES, loadDraftFromDb, loadLocalDraft, persistStep, saveLocalDraft,
  toPlanInput, VARIABLE_CATEGORIES, type Draft, type IncomeType,
} from './draft'

const TOTAL = 10

export default function Onboarding() {
  const uid = useUserId()
  const { data: profile } = useProfile()
  const { data: settings } = useSettings()
  const [params] = useSearchParams()
  const redo = params.has('refazer')
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!profile || draft) return
    void (async () => {
      const local = redo ? null : loadLocalDraft(uid)
      if (local) return setDraft(local)
      const base = {
        ...emptyDraft(profile.display_name ?? '', profile.savings_goal, profile.savings_goal_other ?? ''),
        // Refazendo o plano: a escolha do ranking já foi feita (e pode ser mudada em Configurações).
        showInGlobalRanking: profile.onboarding_done ? profile.show_in_global_ranking : null,
      }
      if (redo || profile.onboarding_step > 3) {
        const d = await loadDraftFromDb(uid, base)
        const step = !d.consentAt ? (redo ? 2 : 1) : redo ? 4 : profile.onboarding_step
        return setDraft({ ...d, step })
      }
      setDraft(base)
    })()
  }, [profile, draft, redo, uid])

  useEffect(() => {
    if (draft && !redo) saveLocalDraft(uid, draft)
  }, [draft, redo, uid])

  if (!draft || !profile || !settings) return <OnboardingSkeleton />
  return (
    <MotionProvider>
      <Flow draft={draft} setDraft={setDraft} profile={profile} settings={settings} redo={redo} />
    </MotionProvider>
  )
}

function OnboardingSkeleton() {
  return (
    <div className="mx-auto max-w-[760px] px-4">
      <div className="h-12" />
      <div className="mt-8 h-8 w-3/4 rounded-block bg-line/60" />
      <div className="mt-4 h-12 w-1/2 rounded-block bg-line/60" />
    </div>
  )
}

interface FlowProps {
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft | null>>
  profile: Profile
  settings: AppSettings
  redo: boolean
}

function Flow({ draft: d, setDraft, profile, settings, redo }: FlowProps) {
  const uid = useUserId()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [dir, setDir] = useState(1)
  const [busy, setBusy] = useState(false)
  const update = (patch: Partial<Draft>) => setDraft({ ...d, ...patch })

  const input = useMemo(() => toPlanInput(d), [d])
  const plan = useMemo(() => (d.income ? computePlan(input, settings) : null), [input, d.income, settings])
  const monthly = plan
    ? d.scenario === 'personalizado' ? d.customMonthly ?? 0 : plan.scenarios[d.scenario].monthly
    : null

  // A tela avança na hora; os passos são salvos em segundo plano, em ordem.
  // Se um salvamento falhar, volta para o passo que não foi salvo.
  const saves = useRef(Promise.resolve())

  function go(to: number, patch: Partial<Draft> = {}) {
    const from = d.step
    const next = { ...d, ...patch, step: to }
    setDir(to > from ? 1 : -1)
    setDraft(next)
    if (to <= from) return
    track('onboarding_step', { step: to })
    saves.current = saves.current.then(async () => {
      try {
        await persistStep(uid, from, next)
        if (!redo) await supabase.from('profiles').update({ onboarding_step: to }).eq('id', uid)
      } catch {
        toast('Não foi possível salvar este passo. Confira sua conexão e tente de novo.', 'error')
        setDraft((cur) => cur && { ...cur, step: from })
      }
    })
  }

  async function finish(reminders: boolean) {
    setBusy(true)
    await saves.current
    if (reminders) {
      const r = await enablePush(uid)
      if (r !== 'granted') toast(PUSH_MESSAGES[r], 'error')
    }
    const { error } = await supabase
      .from('profiles').update({ onboarding_done: true, onboarding_step: TOTAL, reminder_enabled: reminders }).eq('id', uid)
    setBusy(false)
    if (error) return toast('Não foi possível concluir agora. Tente de novo.', 'error')
    clearLocalDraft(uid)
    track('onboarding_done')
    await qc.invalidateQueries({ queryKey: ['profile', uid] })
    const pending = getPending()
    navigate(pending ? pendingPath(pending) : '/app', { replace: true })
  }

  async function confirmPlan() {
    if (!plan || monthly === null) return
    setBusy(true)
    await saves.current
    try {
      await savePlan({ plan, input, scenario: d.scenario, monthly, settings, quick: d.quick })
    } catch {
      setBusy(false)
      return toast(
        profile.has_access
          ? 'Não foi possível salvar o plano. Tente de novo.'
          : 'No plano grátis dá para refazer o plano 1 vez por mês. Libere o acesso para refazer quando quiser.',
        'error',
      )
    }
    setBusy(false)
    await qc.invalidateQueries({ queryKey: ['plan', uid] })
    if (redo) return navigate('/app/plano', { replace: true })
    go(profile.has_access ? 10 : 9)
  }

  // Voltou do Checkout com acesso liberado: a oferta (passo 9) não faz mais sentido.
  useEffect(() => {
    if (d.step === 9 && profile.has_access) go(10)
  })

  const back = d.step > 1 && !(redo && d.step === 4) ? () => go(d.step === 9 && d.skipped ? 1 : d.step - 1) : undefined
  const fixedTotal = Object.values(d.fixed).reduce((a, b) => a + b, 0)
  const warnings = plan ? validatePlanInput(input).warnings : []

  const steps: Record<number, ReactNode> = {
    1: (
      <Step
        title="Vamos montar seu plano para chegar a R$ 125.250"
        footer={
          <>
            <Button type="submit">Montar meu plano</Button>
            <Button type="button" variant="ghost" onClick={() => { track('onboarding_skipped'); go(9, { skipped: true }) }}>
              Pular, só quero o desafio
            </Button>
          </>
        }
        onSubmit={() => go(2)}
      >
        <p className="text-lg">
          Leva uns 2 minutos. O app não movimenta dinheiro: você guarda numa caixinha no seu banco e marca aqui os
          blocos para acompanhar.
        </p>
        <div className="mt-8"><CdiMagic /></div>
      </Step>
    ),
    2: (
      <Step
        title="Sobre você"
        footer={<Button type="submit" disabled={!d.displayName.trim() || !d.goal || !d.incomeType || d.showInGlobalRanking === null || busy}>Continuar</Button>}
        onSubmit={() => go(3)}
      >
        <Field label="Como quer ser chamado(a)?">
          <input autoFocus maxLength={40} className={inputCls} value={d.displayName}
            onChange={(e) => update({ displayName: e.target.value })} />
        </Field>
        <Field label="Para que você quer juntar esse dinheiro?">
          <Choice<SavingsGoal>
            label="Objetivo"
            value={d.goal}
            onChange={(goal) => update({ goal })}
            options={GOALS.map((g) => ({ value: g.value, label: <><span aria-hidden>{g.icon}</span> {g.label}</> }))}
          />
          {d.goal === 'outros' && (
            <input maxLength={40} placeholder="Ex.: comprar um carro, casamento, abrir um negócio" aria-label="Qual é o seu objetivo?"
              className={`${inputCls} mt-3`} value={d.goalOther} onChange={(e) => update({ goalOther: e.target.value })} />
          )}
        </Field>
        <Field label="Como você recebe sua renda?">
          <Choice<IncomeType>
            label="Tipo de renda"
            value={d.incomeType}
            onChange={(incomeType) => update({ incomeType })}
            options={[
              { value: 'clt', label: 'CLT' }, { value: 'autonomo', label: 'Autônomo' },
              { value: 'servidor', label: 'Servidor' }, { value: 'empresario', label: 'Empresário' },
              { value: 'outro', label: 'Outro' },
            ]}
          />
        </Field>
        <Field label="Quer aparecer no ranking geral de quem mais guardou?">
          <p className="-mt-1 mb-3 text-sm text-muted">
            Aparecem só o nome acima e o total que você marcou nos blocos. Renda, gastos e plano nunca aparecem. Dá para
            mudar quando quiser em Configurações.
          </p>
          <Choice<boolean>
            label="Ranking geral"
            value={d.showInGlobalRanking}
            onChange={(showInGlobalRanking) => update({ showInGlobalRanking })}
            options={[{ value: true, label: 'Sim, quero aparecer' }, { value: false, label: 'Não, prefiro ficar de fora' }]}
          />
        </Field>
        <Field label="Data de nascimento (opcional)">
          <input type="date" className={inputCls} value={d.birthDate} onChange={(e) => update({ birthDate: e.target.value })} />
        </Field>
        <div className="flex gap-3">
          <Field label="Cidade (opcional)" className="flex-1">
            <input className={inputCls} maxLength={80} value={d.city} onChange={(e) => update({ city: e.target.value })} />
          </Field>
          <Field label="UF" className="w-20">
            <input className={inputCls} maxLength={2} value={d.state} onChange={(e) => update({ state: e.target.value.toUpperCase() })} />
          </Field>
        </div>
      </Step>
    ),
    3: (
      <Step
        title="Seus dados financeiros ficam só com você"
        footer={
          <>
            <Button type="submit" disabled={!d.consentAt || busy}>Continuar</Button>
            <Button type="button" variant="ghost" onClick={() => go(4, { consentAt: null, quick: true })}>
              Calcular sem salvar nada
            </Button>
          </>
        }
        onSubmit={() => go(4, { quick: false })}
      >
        <p className="text-lg">
          Para calcular seu plano, vamos guardar sua renda e seus gastos. Só você vê esses dados, e você pode apagar
          quando quiser.
        </p>
        <label className="mt-6 flex min-h-12 items-center gap-3 rounded-field border-2 border-line px-4 py-3">
          <input type="checkbox" className="size-5 accent-forest" checked={!!d.consentAt}
            onChange={(e) => update({ consentAt: e.target.checked ? new Date().toISOString() : null })} />
          Concordo em guardar meus dados financeiros para calcular o plano.
        </label>
        <p className="mt-4 text-sm text-muted">
          Sem aceitar, o cálculo roda só no seu aparelho e guardamos apenas o valor mensal que você escolher.
        </p>
      </Step>
    ),
    4: (
      <Step
        title="Quanto cai na sua conta por mês?"
        footer={<Button type="submit" disabled={!d.income || d.paydays.length === 0 || busy}>Continuar</Button>}
        onSubmit={() => go(5)}
      >
        <CurrencyInput large autoFocus aria-label="Salário líquido mensal" value={d.income} onChange={(income) => update({ income })} />
        <p className="mt-1 text-sm text-muted">Salário líquido, o valor que entra na conta.</p>
        <Field label="Renda extra média por mês (opcional)">
          <CurrencyInput value={d.extraIncome} onChange={(extraIncome) => update({ extraIncome })} aria-label="Renda extra" />
        </Field>
        <Field label="Em que dia você recebe? (até 2 datas)">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
              const on = d.paydays.includes(day)
              return (
                <button key={day} type="button" aria-pressed={on}
                  onClick={() => update({
                    paydays: on ? d.paydays.filter((x) => x !== day) : [...d.paydays, day].slice(-2).sort((a, b) => a - b),
                  })}
                  className={`num aspect-square min-h-11 rounded-block text-sm font-semibold ${on ? 'bg-forest text-cream' : 'border border-line'}`}>
                  {day}
                </button>
              )
            })}
          </div>
        </Field>
      </Step>
    ),
    5: (
      <Step
        title="Quais são seus gastos fixos?"
        footer={<Button type="submit" disabled={fixedTotal <= 0 || busy}>Continuar</Button>}
        onSubmit={() => go(6)}
      >
        <TotalLine total={fixedTotal} income={input.income} />
        <ExpenseList categories={FIXED_CATEGORIES} values={d.fixed} onChange={(fixed) => update({ fixed })} />
      </Step>
    ),
    6: (
      <Step
        title="E os gastos que variam?"
        footer={
          <>
            <Button type="submit" disabled={busy}>Continuar</Button>
            <Button type="button" variant="ghost" onClick={() => go(7, { variable: null })}>Não sei, estime para mim</Button>
          </>
        }
        onSubmit={() => go(7, { variable: d.variable ?? {} })}
      >
        <p className="mb-4 text-muted">Opcional. Se preferir, estimamos {Math.round(settings.variableEstimatePct * 100)}% da sua renda.</p>
        <ExpenseList categories={VARIABLE_CATEGORIES} values={d.variable ?? {}} onChange={(variable) => update({ variable })} />
      </Step>
    ),
    7: (
      <Step
        title="Como está sua situação hoje?"
        footer={<Button type="submit" disabled={d.hasHighInterestDebt === null || busy}>Ver meu plano</Button>}
        onSubmit={() => go(8, { currentSavings: d.currentSavings ?? 0, scenario: plan?.suggested ?? 'recomendado' })}
      >
        <Field label="Quanto você já tem guardado?">
          <CurrencyInput autoFocus value={d.currentSavings} onChange={(currentSavings) => update({ currentSavings })} aria-label="Valor já guardado" />
        </Field>
        <Field label="Você tem reserva de emergência?">
          <Choice<string>
            label="Reserva de emergência"
            value={d.hasEmergencyFund === null ? 'nao_sei' : d.hasEmergencyFund ? 'sim' : 'nao'}
            onChange={(v) => update({ hasEmergencyFund: v === 'nao_sei' ? null : v === 'sim' })}
            options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }, { value: 'nao_sei', label: 'Não sei' }]}
          />
        </Field>
        <Field label="Tem dívida com juros altos? Cartão rotativo, cheque especial ou empréstimo pessoal.">
          <Choice<boolean>
            label="Dívida com juros altos"
            value={d.hasHighInterestDebt}
            onChange={(hasHighInterestDebt) => update({ hasHighInterestDebt })}
            options={[{ value: true, label: 'Sim' }, { value: false, label: 'Não' }]}
          />
        </Field>
        {warnings.length > 0 && (
          <p className="mt-6 rounded-field bg-gold/25 p-4">
            {warnings[0]} <button type="button" className="font-semibold underline" onClick={() => go(5)}>Revisar gastos fixos</button>
          </p>
        )}
      </Step>
    ),
    8: plan && monthly !== null && (
      <Step
        title="Seu plano"
        footer={<Button type="submit" disabled={busy || (plan.status !== 'resgate' && monthly <= 0)}>Começar meu desafio</Button>}
        onSubmit={confirmPlan}
      >
        <p className="text-muted">Sobra por mês{plan.variableEstimated && ' (variáveis estimados)'}</p>
        <AnimatedBRL value={Math.max(0, plan.sobra)} className="block text-4xl font-extrabold" />

        {plan.status === 'resgate' ? (
          <div className="mt-6"><Rescue plan={plan} /></div>
        ) : (
          <div className="mt-6 space-y-6">
            <FlexibleSuggestion monthly={monthly} sobra={plan.sobra} />
            <p className="-mb-3 font-medium">Prefere outro ritmo? Escolha um valor:</p>
            <ScenarioPicker plan={plan} value={d.scenario} customMonthly={d.customMonthly}
              onChange={(scenario) => update({ scenario })}
              onCustom={(customMonthly) => update({ scenario: 'personalizado', customMonthly })} />
            <Forecast monthly={monthly} currentSavings={input.currentSavings} yieldRate={settings.yieldRate} />
            <p className="text-xs text-muted">Referência: guardar 20% da renda seria {formatBRL(plan.rule20)} por mês.</p>
            <Section title="Por onde começar">
              <p className="mb-3">
                {plan.status === 'apertado'
                  ? 'Comece pelo desafio de 100 blocos e suba um degrau de cada vez. Cada degrau concluído é uma vitória.'
                  : `Comece pelo desafio de ${plan.recommendedBlocks} blocos (${formatBRL(BLOCK_TOTAL[plan.recommendedBlocks])}).`}
              </p>
              <Ladder ladder={plan.ladder} />
            </Section>
            <Section title="Prioridades">
              <Priorities plan={plan} monthly={monthly} currentSavings={input.currentSavings}
                yieldRate={settings.yieldRate} hasDebt={input.hasHighInterestDebt} />
            </Section>
            <PartnerHint monthly={monthly} currentSavings={input.currentSavings} />
          </div>
        )}
        <p className="mt-8 text-xs text-muted">{DISCLAIMER}</p>
      </Step>
    ),
    9: (
      <Step
        title={plan && monthly && d.scenario
          ? `Seu plano está pronto: ${formatBRL(monthly)} por mês até ${targetLabel(monthly, input.currentSavings, settings.yieldRate)}`
          : 'Comece seu desafio hoje'}
        footer={
          <>
            <Button type="submit" disabled={busy}>{busy ? 'Abrindo o pagamento…' : `Liberar por ${settings.priceLabel}`}</Button>
            <Button type="button" variant="ghost" onClick={() => go(10)}>Agora não</Button>
          </>
        }
        onSubmit={async () => {
          setBusy(true)
          const r = await startCheckout('onboarding')
          if (r === 'already') go(10)
          if (r !== 'redirecting') setBusy(false)
        }}
      >
        <p className="text-lg">
          Libere seu acesso vitalício por <strong>{settings.priceLabel}</strong> e comece hoje. Pagamento único, sem mensalidade.
        </p>
        <div className="mt-6"><GridPreview blocks={plan?.recommendedBlocks ?? 500} /></div>
        <ul className="mt-6 space-y-2">
          {INCLUDED.map((t) => (
            <li key={t} className="flex gap-3"><span className="mt-1.5 size-3 shrink-0 rounded-[3px] bg-leaf" aria-hidden />{t}</li>
          ))}
        </ul>
      </Step>
    ),
    10: (
      <Step
        title={monthly
          ? `Quer que a gente te lembre no dia do salário de separar ${formatBRL(monthly / Math.max(1, d.paydays.length))}?`
          : 'Quer um lembrete para marcar seus blocos?'}
        footer={
          <>
            <Button type="submit" disabled={busy}>Ativar lembretes</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => finish(false)}>Agora não</Button>
          </>
        }
        onSubmit={() => finish(true)}
      >
        <p className="text-lg">
          {monthly
            ? `Avisamos às 9h ${d.paydays.length > 1 ? `nos dias ${d.paydays.join(' e ')}` : `no dia ${d.paydays[0]}`} e,
               nos outros dias, às ${profile.reminder_time.slice(0, 5)}. Dá para mudar em Configurações.`
            : `Avisamos às ${profile.reminder_time.slice(0, 5)}. Dá para mudar em Configurações.`}
        </p>
      </Step>
    ),
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[760px] flex-col px-4">
      <StepBlocks current={d.step} total={TOTAL} onBack={back} />
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <m.div
          key={d.step}
          custom={dir}
          variants={{
            enter: (s: number) => ({ x: 24 * s, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (s: number) => ({ x: -24 * s, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex flex-1 flex-col"
        >
          {steps[d.step] ?? steps[1]}
        </m.div>
      </AnimatePresence>
    </div>
  )
}

function targetLabel(monthly: number, currentSavings: number, yieldRate: number) {
  const months = monthsToReach(GOAL, currentSavings, monthly, yieldRate)
  return months === null ? 'a meta' : formatMonthYear(addMonths(new Date(), months))
}

const inputCls = 'w-full min-h-12 rounded-field border-2 border-line bg-transparent px-3 outline-none focus:border-forest'

function Step({ title, children, footer, onSubmit }: {
  title: string; children: ReactNode; footer: ReactNode; onSubmit: () => void
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <h1 className="mt-6 mb-6 text-xl leading-tight font-bold text-balance">{title}</h1>
      <div className="flex-1 pb-6">{children}</div>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-1 bg-cream px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {footer}
      </div>
    </form>
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`mt-6 ${className}`}>
      <p className="mb-2 font-medium">{label}</p>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function TotalLine({ total, income }: { total: number; income: number }) {
  const pct = income > 0 ? Math.round((total / income) * 100) : 0
  return (
    <p className={`mb-4 ${pct > 100 ? 'text-danger' : 'text-muted'}`}>
      Total <AnimatedBRL value={total} className="font-bold text-ink" />
      {income > 0 && <>, {pct}% da sua renda</>}
    </p>
  )
}

function ExpenseList({ categories, values, onChange }: {
  categories: readonly { key: string; label: string; icon: string }[]
  values: Record<string, number>
  onChange: (values: Record<string, number>) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="divide-y divide-line">
      {categories.map((c) => (
        <li key={c.key}>
          <button type="button" aria-expanded={open === c.key} onClick={() => setOpen(open === c.key ? null : c.key)}
            className="flex min-h-14 w-full items-center gap-3 text-left">
            <span className="text-xl" aria-hidden>{c.icon}</span>
            <span className="flex-1 font-medium">{c.label}</span>
            {values[c.key] > 0 && <span className="num font-bold">{formatBRL(values[c.key])}</span>}
          </button>
          {open === c.key && (
            <div className="pb-4 pl-10">
              <CurrencyInput autoFocus aria-label={`Valor de ${c.label}`} value={values[c.key] ?? null}
                onChange={(v) => onChange({ ...values, [c.key]: v ?? 0 })} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function PartnerHint({ monthly, currentSavings }: { monthly: number; currentSavings: number }) {
  const months = monthsWithPartner(monthly, currentSavings)
  if (!months) return null
  return (
    <section className="rounded-field bg-forest p-4 text-cream">
      <h2 className="font-bold">Junte 100 mil com um amigo</h2>
      <p className="mt-1">
        Com mais uma pessoa guardando o mesmo valor, vocês chegam em {formatDuration(months)}. Dá para entrar nesse
        movimento depois de liberar o acesso.
      </p>
    </section>
  )
}
