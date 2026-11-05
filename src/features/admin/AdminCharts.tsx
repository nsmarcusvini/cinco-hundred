import { useState, type ReactNode } from 'react'
import { Button, Choice } from '../../components/ui'
import { PERIODS, pct } from './AdminApi'

/** Número grande com legenda pequena. Sem cartão: quem separa é o espaço. */
export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <p className="num text-2xl leading-none font-extrabold">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="mt-1 max-w-[62ch] text-xs text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function PeriodPicker({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <Choice
      label="Período"
      value={days}
      onChange={onChange}
      options={PERIODS.map((d) => ({ value: d, label: d === 365 ? '1 ano' : `${d} dias` }))}
    />
  )
}

export function Loading() {
  return <p className="py-10 text-muted">Carregando…</p>
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-10">
      <p>Não foi possível carregar estes dados.</p>
      <Button variant="secondary" className="mt-3" onClick={onRetry}>Tentar de novo</Button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="max-w-[62ch] border-l-4 border-line py-1 pl-3 text-muted">{children}</p>
}

interface Point {
  label: string
  value: number
}

/** Colunas de uma série só: o título diz o que é, sem legenda. Cada coluna responde a mouse e teclado; a tabela traz tudo. */
export function ColumnChart({ title, data, unit }: { title: string; data: Point[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const hovered = active === null ? null : data[active]

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="font-semibold">{title}</figcaption>
      <div className="relative mt-3 h-36 border-b-2 border-ink/70" role="img" aria-label={`${title}: ${total} no total, máximo de ${max} em um período`}>
        <span className="num absolute top-0 left-0 text-xs text-muted">{max}</span>
        <div className="absolute inset-x-0 top-5 border-t border-dashed border-line" aria-hidden />
        <div className="absolute inset-0 top-5 flex items-end gap-[2px]">
          {data.map((d, i) => (
            <div
              key={d.label}
              tabIndex={0}
              aria-label={`${d.label}: ${d.value} ${unit}`}
              className="group flex h-full min-w-0 flex-1 items-end outline-offset-1"
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <span
                className={`block w-full rounded-t-[4px] ${d.value ? 'bg-forest group-hover:bg-leaf' : 'bg-transparent'}`}
                style={{ height: `${(d.value / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
        {hovered && (
          <p
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 rounded-block bg-ink px-2 py-1 text-xs whitespace-nowrap text-cream"
            style={{ left: `${Math.min(88, Math.max(12, ((active! + 0.5) / data.length) * 100))}%` }}
          >
            <strong className="num">{hovered.value}</strong> {unit} em {hovered.label}
          </p>
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-[280px]">
          <tbody>
            {data.map((d) => (
              <tr key={d.label}><td className="py-0.5">{d.label}</td><td className="num text-right text-ink">{d.value}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

interface Row {
  key: string
  label: ReactNode
  value: number
  note?: ReactNode
}

/** Barras horizontais com o valor sempre escrito ao lado. */
export function BarList({ rows, max }: { rows: Row[]; max?: number }) {
  const top = Math.max(1, max ?? 0, ...rows.map((r) => r.value))
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.key} className="py-2">
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 text-xs text-muted">
              {r.note && <>{r.note} </>}
              <strong className="num text-base font-extrabold text-ink">{r.value}</strong>
            </span>
          </div>
          <div className="mt-1 h-2 bg-line/50" aria-hidden>
            <div className="h-full rounded-r-[4px] bg-forest" style={{ width: `${(r.value / top) * 100}%`, minWidth: r.value ? 4 : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Retenção como parede de blocos: cada semana depois do cadastro é um bloco, mais escuro quanto mais gente voltou. */
export function RetentionGrid({ rows, weeks, weekLabel }: {
  rows: { week: string; size: number; retained: number[] }[]
  weeks: number
  weekLabel: (week: string) => string
}) {
  const columns = Array.from({ length: weeks }, (_, k) => k)
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px] text-xs">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pr-3 text-left font-normal">Cadastro</th>
            <th scope="col" className="pr-3 text-right font-normal">Pessoas</th>
            {columns.map((k) => <th key={k} scope="col" className="w-11 font-normal">{k === 0 ? 'Sem. 0' : `+${k}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.week}>
              <th scope="row" className="pr-3 text-left font-medium whitespace-nowrap">{weekLabel(r.week)}</th>
              <td className="num pr-3 text-right">{r.size}</td>
              {columns.map((k) => {
                const n = r.retained[k]
                if (n === undefined) return <td key={k} className="h-11 w-11 rounded-block border border-dashed border-line" aria-label="Ainda não aconteceu" />
                const p = pct(n, r.size)
                return (
                  <td
                    key={k}
                    title={`${n} de ${r.size} pessoas`}
                    className={`num h-11 w-11 rounded-block text-center font-semibold ${p >= 65 ? 'text-cream' : 'text-ink'}`}
                    style={{ background: `color-mix(in srgb, var(--color-forest) ${Math.max(p, 4)}%, var(--color-cream))` }}
                  >
                    {p}%
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
