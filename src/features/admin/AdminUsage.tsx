import { EVENT_LABEL, PRODUCT_FEATURES, routeLabel, useUsage, usePeriod, type Usage } from './AdminApi'
import { BarList, Empty, LoadError, Loading, PeriodPicker, Section } from './AdminCharts'

// Limites do Web Vitals. CLS é guardado em milésimos (0,1 = 100).
const VITAL = {
  LCP: { good: 2500, poor: 4000, unit: 'ms', name: 'Carregamento (LCP)' },
  INP: { good: 200, poor: 500, unit: 'ms', name: 'Resposta ao toque (INP)' },
  CLS: { good: 100, poor: 250, unit: '', name: 'Estabilidade (CLS)' },
}

function rating(metric: keyof typeof VITAL, p75: number) {
  const v = VITAL[metric]
  return p75 <= v.good ? 'Bom' : p75 <= v.poor ? 'Precisa melhorar' : 'Ruim'
}

function Vitals({ rows }: { rows: Usage['vitals'] }) {
  const known = rows.filter((r) => r.metric in VITAL)
  const worst = [...known].sort((a, b) => b.p75 / VITAL[b.metric].good - a.p75 / VITAL[a.metric].good)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead className="text-xs text-muted">
          <tr className="border-b-2 border-ink/70">
            <th scope="col" className="py-2 pr-4 font-normal">Tela</th>
            <th scope="col" className="py-2 pr-4 font-normal">Medida</th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">Valor (p75)</th>
            <th scope="col" className="py-2 pr-4 font-normal">Avaliação</th>
            <th scope="col" className="py-2 text-right font-normal">Amostras</th>
          </tr>
        </thead>
        <tbody>
          {worst.slice(0, 12).map((r) => (
            <tr key={r.route + r.metric} className="border-b border-line">
              <td className="py-2 pr-4">{routeLabel(r.route)}</td>
              <td className="py-2 pr-4">{VITAL[r.metric].name}</td>
              <td className="num py-2 pr-4 text-right">{r.metric === 'CLS' ? (r.p75 / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3 }) : `${r.p75} ${VITAL[r.metric].unit}`}</td>
              <td className="py-2 pr-4">{rating(r.metric, r.p75)}</td>
              <td className="num py-2 text-right">{r.samples}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminUsage() {
  const [days, setDays] = usePeriod()
  const { data, isPending, isError, refetch } = useUsage(days)
  const used = new Set(data?.features.map((f) => f.name))
  const unused = PRODUCT_FEATURES.filter((f) => !used.has(f))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Uso</h1>
        <PeriodPicker days={days} onChange={setDays} />
      </div>
      {isPending ? <Loading /> : isError ? <LoadError onRetry={() => void refetch()} /> : (
        <>
          <div className="grid gap-x-12 md:grid-cols-2">
            <Section title="Telas mais abertas" hint="Quem não fez login conta como visita, sem identificação.">
              {data.pages.length === 0
                ? <Empty>Ainda sem visitas registradas. A contagem de telas começa quando esta versão for publicada.</Empty>
                : <BarList rows={data.pages.map((p) => ({
                    key: p.route,
                    label: routeLabel(p.route),
                    value: p.views,
                    note: p.users ? `${p.users} ${p.users === 1 ? 'pessoa' : 'pessoas'}` : undefined,
                  }))} />}
            </Section>
            <Section title="Ações mais usadas" hint="Quantas vezes aconteceu e quantas pessoas fizeram.">
              {data.features.length === 0
                ? <Empty>Nenhuma ação no período.</Empty>
                : <BarList rows={data.features.map((f) => ({
                    key: f.name,
                    label: EVENT_LABEL[f.name] ?? f.name,
                    value: f.times,
                    note: f.users ? `${f.users} ${f.users === 1 ? 'pessoa' : 'pessoas'}` : undefined,
                  }))} />}
            </Section>
          </div>

          {unused.length > 0 && (
            <Section title="Recursos sem uso no período" hint="Candidatos a melhorar, divulgar melhor ou retirar.">
              <ul className="flex flex-wrap gap-2">
                {unused.map((f) => <li key={f} className="rounded-block border-2 border-line px-2 py-1">{EVENT_LABEL[f]}</li>)}
              </ul>
            </Section>
          )}

          <Section title="Velocidade por tela" hint="Medido nos aparelhos das pessoas. As piores aparecem primeiro.">
            {data.vitals.length === 0 ? <Empty>Sem medições no período.</Empty> : <Vitals rows={data.vitals} />}
          </Section>
        </>
      )}
    </>
  )
}
