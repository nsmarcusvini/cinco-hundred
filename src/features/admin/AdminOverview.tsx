import { fmtDay, useOverview, usePeriod } from './AdminApi'
import { ColumnChart, LoadError, Loading, PeriodPicker, Section, Stat } from './AdminCharts'

export default function AdminOverview() {
  const [days, setDays] = usePeriod()
  const { data, isPending, isError, refetch } = useOverview(days)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Visão geral</h1>
        <PeriodPicker days={days} onChange={setDays} />
      </div>
      {isPending ? <Loading /> : isError ? <LoadError onRetry={() => void refetch()} /> : (
        <>
          <div className="mt-6 flex flex-wrap gap-x-12 gap-y-6">
            <Stat value={data.users} label="Pessoas cadastradas" />
            <Stat value={data.new_users} label="Novas no período" />
            <Stat value={data.paying} label="Pagantes" />
            <Stat value={data.trialing} label="Em teste grátis" />
            <Stat value={data.courtesy} label="Com cortesia" />
            <Stat value={data.blocks_marked} label="Blocos marcados no período" />
          </div>

          <Section title="Pessoas ativas" hint="Ativa é quem abriu uma tela, fez uma ação ou marcou um bloco. Suas contas de admin não entram na conta.">
            <div className="mb-6 flex flex-wrap gap-x-12 gap-y-6">
              <Stat value={data.active_today} label="Hoje" />
              <Stat value={data.active_7d} label="Últimos 7 dias" />
              <Stat value={data.active_30d} label="Últimos 30 dias" />
            </div>
            <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
              <ColumnChart title="Ativas por dia" unit="ativas" data={data.daily.map((d) => ({ label: fmtDay(d.day), value: d.active }))} />
              <ColumnChart title="Ativas por semana" unit="ativas" data={data.weekly.map((w) => ({ label: `semana de ${fmtDay(w.week)}`, value: w.active }))} />
            </div>
          </Section>

          <div className="mt-10">
            <ColumnChart title="Cadastros por dia" unit="cadastros" data={data.daily.map((d) => ({ label: fmtDay(d.day), value: d.signups }))} />
          </div>
        </>
      )}
    </>
  )
}
