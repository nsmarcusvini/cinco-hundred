import { fmtDay, pct, useFunnel, usePeriod, useRetention, type Funnel } from './AdminApi'
import { BarList, Empty, LoadError, Loading, PeriodPicker, RetentionGrid, Section, Stat } from './AdminCharts'

const WEEKS = 8

function steps(f: Funnel) {
  return [
    { key: 'signups', label: 'Cadastro', value: f.signups },
    { key: 'onboarded', label: 'Concluiu o onboarding', value: f.onboarded },
    { key: 'checkout', label: 'Abriu o pagamento', value: f.checkout },
    ...(f.trial ? [{ key: 'trial', label: 'Começou o teste grátis', value: f.trial }] : []),
    { key: 'paid', label: 'Pagou', value: f.paid },
    { key: 'first_block', label: 'Marcou o primeiro bloco', value: f.first_block },
  ]
}

/** Maior queda de uma etapa para a seguinte: o ponto que mais vale olhar. */
function biggestDrop(rows: ReturnType<typeof steps>) {
  let worst: { from: string; to: string; lost: number } | null = null
  for (let i = 1; i < rows.length; i++) {
    const lost = rows[i - 1].value - rows[i].value
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { from: rows[i - 1].label, to: rows[i].label, lost }
  }
  return worst
}

export default function AdminFunnel() {
  const [days, setDays] = usePeriod(90)
  const funnel = useFunnel(days)
  const retention = useRetention(WEEKS)
  const f = funnel.data

  const rows = f ? steps(f) : []
  const drop = biggestDrop(rows)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Funil</h1>
        <PeriodPicker days={days} onChange={setDays} />
      </div>
      <p className="mt-1 max-w-[62ch] text-xs text-muted">Quem se cadastrou no período. Cada etapa conta quem chegou nela, em qualquer ordem: dá para pagar antes de terminar o onboarding.</p>

      {funnel.isPending ? <Loading /> : funnel.isError || !f ? <LoadError onRetry={() => void funnel.refetch()} /> : f.signups === 0 ? (
        <div className="mt-6"><Empty>Ninguém se cadastrou neste período. Escolha um período maior.</Empty></div>
      ) : (
        <>
          {drop && (
            <p className="mt-6 max-w-[62ch] text-lg font-semibold">
              A maior perda está entre {drop.from.toLowerCase()} e {drop.to.toLowerCase()}: <span className="num">{drop.lost}</span> {drop.lost === 1 ? 'pessoa' : 'pessoas'}.
            </p>
          )}
          <div className="mt-4 max-w-[640px]">
            <BarList max={f.signups} rows={rows.map((s) => ({ ...s, note: `${pct(s.value, f.signups)}%` }))} />
          </div>

          <Section title="Onde as pessoas desistem">
            <div className="flex flex-wrap gap-x-12 gap-y-6">
              <Stat value={f.signups - f.onboarded} label="Pararam no onboarding" />
              <Stat value={f.canceled_checkout} label="Voltaram do pagamento sem pagar" />
              <Stat value={f.paid_no_block} label="Pagaram e não marcaram bloco" />
            </div>
            {f.stalled.length > 0 && (
              <div className="mt-6 max-w-[640px]">
                <p className="font-semibold">Em qual passo do onboarding pararam</p>
                <BarList rows={f.stalled.map((s) => ({ key: String(s.step), label: `Passo ${s.step}`, value: s.users }))} />
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="Retenção" hint={`Pessoas que voltaram em cada semana depois do cadastro, nas últimas ${WEEKS} semanas. Quanto mais escuro o bloco, mais gente voltou.`}>
        {retention.isPending ? <Loading /> : retention.isError ? <LoadError onRetry={() => void retention.refetch()} /> : retention.data.length === 0
          ? <Empty>Sem cadastros nas últimas {WEEKS} semanas.</Empty>
          : <RetentionGrid rows={retention.data} weeks={WEEKS} weekLabel={(w) => `Semana de ${fmtDay(w)}`} />}
      </Section>
    </>
  )
}
