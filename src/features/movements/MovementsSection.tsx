import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { totalOf } from '../../lib/blocks'
import { formatBRL } from '../../lib/format'
import type { ChallengeSummary } from '../challenges/api'
import { movementAccent } from './accent'
import { useJoinMovement, type Movement } from './api'
import { InitialBalanceSheet } from './InitialBalanceSheet'

type Tab = 'explore' | 'started'
type MovementWithCount = Movement & { participants: number }

const MODE_LABEL = { solo: 'Individual', duo: 'Em dupla', group: 'Em grupo' }
const TABS: { id: Tab; label: string }[] = [
  { id: 'explore', label: 'Explorar' },
  { id: 'started', label: 'Iniciados' },
]

const accentStyle = (slug: string) => ({ '--accent': movementAccent(slug) }) as CSSProperties

/**
 * Movimentos na Início, em duas abas: Explorar (os que a pessoa ainda não iniciou) e Iniciados
 * (com progresso e "Continuar"). Iniciado = existe um desafio do movimento em que ela é membro.
 */
export function MovementsSection({ movements, challenges, forceExplore }: {
  movements: MovementWithCount[]
  challenges: ChallengeSummary[]
  /** O tutorial aponta para os cards de Explorar. */
  forceExplore?: boolean
}) {
  const mine = new Map(challenges.filter((c) => c.movement_id).map((c) => [c.movement_id!, c]))
  const explore = movements.filter((m) => !mine.has(m.id))
  const started = movements.flatMap((m) => (mine.has(m.id) ? [{ m, c: mine.get(m.id)! }] : []))

  const [chosen, setChosen] = useState<Tab | null>(null)
  const tab: Tab = forceExplore ? 'explore' : (chosen ?? (started.length ? 'started' : 'explore'))
  const base = useId()
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ explore: null, started: null })
  const { join, busySlug, ask, closeAsk, startWithBalance } = useJoinMovement()

  function onKeyDown(e: KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const t = TABS[(next + TABS.length) % TABS.length].id
    setChosen(t)
    tabRefs.current[t]?.focus()
  }

  const count = { explore: explore.length, started: started.length }

  return (
    <section aria-labelledby={`${base}-title`}>
      <h2 id={`${base}-title`} className="mb-3 text-lg font-bold">Movimentos</h2>
      <div role="tablist" aria-label="Movimentos" onKeyDown={onKeyDown}
        className="mb-4 grid grid-cols-2 gap-1 rounded-field border-2 border-line p-1">
        {TABS.map((t) => {
          const selected = t.id === tab
          return (
            <button key={t.id} ref={(el) => { tabRefs.current[t.id] = el }} type="button" role="tab"
              id={`${base}-tab-${t.id}`} aria-controls={`${base}-panel-${t.id}`} aria-selected={selected}
              tabIndex={selected ? 0 : -1} onClick={() => setChosen(t.id)}
              className={`min-h-11 rounded-[10px] px-3 font-semibold transition-colors duration-150 ${
                selected ? 'bg-forest text-cream' : 'text-forest hover:bg-line/50'
              }`}>
              {t.label} <span className={`num text-sm ${selected ? 'text-cream/80' : 'text-muted'}`}>({count[t.id]})</span>
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`${base}-panel-${tab}`} aria-labelledby={`${base}-tab-${tab}`} tabIndex={-1}>
        {tab === 'explore' ? (
          explore.length ? (
            <ul className="space-y-3">
              {explore.map((m) => (
                <ExploreCard key={m.id} m={m} busy={busySlug === m.slug} disabled={!!busySlug} onStart={() => join(m.slug, m)} />
              ))}
            </ul>
          ) : (
            <Empty>
              Você já iniciou todos os movimentos abertos.{' '}
              <button type="button" className="font-semibold text-forest underline underline-offset-4" onClick={() => setChosen('started')}>
                Ver Iniciados
              </button>
            </Empty>
          )
        ) : started.length ? (
          <ul className="space-y-3">
            {started.map(({ m, c }) => <StartedCard key={m.id} m={m} c={c} />)}
          </ul>
        ) : (
          <Empty>
            Nenhum movimento iniciado ainda.{' '}
            <button type="button" className="font-semibold text-forest underline underline-offset-4" onClick={() => setChosen('explore')}>
              Explorar movimentos
            </button>
          </Empty>
        )}
      </div>
      <InitialBalanceSheet open={ask !== null} blocks={ask?.blocks ?? 500} busy={busySlug !== null}
        onClose={closeAsk} onConfirm={startWithBalance} />
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-field border-2 border-dashed border-line p-4 text-muted">{children}</p>
}

function ExploreCard({ m, busy, disabled, onStart }: { m: MovementWithCount; busy: boolean; disabled: boolean; onStart: () => void }) {
  const starts = m.starts_at ? new Date(m.starts_at) : null
  const ended = !!m.ends_at && new Date(m.ends_at) < new Date()
  return (
    <li data-tour={`movement-${m.slug}`} style={accentStyle(m.slug)} className="mv-card rounded-field p-4">
      <span className="mv-chip">{MODE_LABEL[m.mode]}</span>
      <h3 className="mt-2 font-bold leading-snug">
        <Link to={`/m/${m.slug}`} className="underline-offset-4 hover:underline">{m.title}</Link>
      </h3>
      {m.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{m.description}</p>}
      <p className="num mt-2 text-sm">
        {m.blocks} blocos, <strong>{formatBRL(totalOf(m.blocks))}</strong> no fim
      </p>
      <p className="text-sm text-muted">
        {m.participants === 1 ? '1 pessoa participando' : `${m.participants.toLocaleString('pt-BR')} pessoas participando`}
        {starts && starts > new Date() && `, começa ${starts.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="mv-cta" onClick={onStart} disabled={disabled || ended} aria-busy={busy}
          aria-label={ended ? `${m.title}: encerrado` : `Iniciar movimento ${m.title}`}>
          {ended ? 'Encerrado' : busy ? 'Iniciando…' : 'Iniciar movimento'}
        </button>
        <Link to={`/m/${m.slug}`} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          Ver detalhes e ranking<span className="sr-only">: {m.title}</span>
        </Link>
      </div>
    </li>
  )
}

function StartedCard({ m, c }: { m: MovementWithCount; c: ChallengeSummary }) {
  const goal = totalOf(c.blocks)
  const pct = Math.min(100, (c.saved / goal) * 100)
  const done = c.status === 'completed'
  return (
    <li data-tour={`movement-${m.slug}`} style={accentStyle(m.slug)}>
      <Link to={`/app/d/${c.id}`} className="mv-card block rounded-field p-4">
        <div className="flex items-center gap-2">
          <span className="mv-chip">{MODE_LABEL[m.mode]}</span>
          {done && <span className="rounded-[3px] bg-gold px-2 py-0.5 text-xs font-semibold text-forest">completo</span>}
        </div>
        <h3 className="mt-2 font-bold leading-snug">{m.title}</h3>
        <p className="mt-1">
          <span className="num text-xl font-extrabold">{formatBRL(c.saved)}</span>{' '}
          <span className="num text-sm text-muted">de {formatBRL(goal)}</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-[3px] bg-line" role="progressbar" aria-label={`Progresso em ${m.title}`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(pct)}>
          <div className="h-full bg-(--accent)" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="num text-xs text-muted">{Math.floor(pct)}%, {c.marked} de {c.blocks} blocos</p>
          <span className="mv-cta">{done ? 'Ver grade' : 'Continuar'} <span aria-hidden>›</span></span>
        </div>
      </Link>
    </li>
  )
}
