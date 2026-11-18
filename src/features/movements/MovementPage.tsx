import { Link, useParams } from 'react-router'
import { Button, GridPreview } from '../../components/ui'
import { totalOf } from '../../lib/blocks'
import { formatBRL } from '../../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { movementAccent } from './accent'
import { useJoinMovement, useMovement, useMyMovementChallenge, type RankRow } from './api'
import { MovementBalanceSheet } from './InitialBalanceSheet'

const MODE_LABEL = { solo: 'Individual', duo: 'Em dupla', group: 'Em grupo' }

/** /m/:slug — abre sem login (link da bio, stories, anúncio). */
export default function MovementPage() {
  const { slug = '' } = useParams()
  const { session } = useAuth()
  const { data: m, isPending } = useMovement(slug)
  const { data: mine } = useMyMovementChallenge(m?.id, !!session)
  const { join, busySlug, ask, closeAsk, startWithBalance } = useJoinMovement()

  if (isPending) {
    return (
      <main className="mx-auto max-w-[760px] px-4 py-8" aria-hidden>
        <div className="h-40 rounded-field bg-line/60" />
        <div className="mt-6 h-8 w-2/3 rounded-block bg-line/60" />
      </main>
    )
  }
  if (!m) {
    return (
      <main className="mx-auto max-w-[760px] px-4 py-10">
        <Link to="/" className="text-lg font-extrabold text-forest">Tijoloblock</Link>
        <h1 className="mt-10 text-xl font-bold">Movimento não encontrado</h1>
        <p className="mt-2 text-muted">Ele pode ter terminado. Veja os movimentos ativos no app.</p>
      </main>
    )
  }

  const starts = m.starts_at ? new Date(m.starts_at) : null
  const upcoming = starts && starts > new Date()
  const ended = m.ends_at && new Date(m.ends_at) < new Date()

  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col px-4 pb-28">
      <header className="-mx-4 border-b-[6px] bg-forest px-4 pt-6 pb-8 text-cream" style={{ borderBottomColor: movementAccent(m.slug) }}>
        <Link to={session ? '/app' : '/'} className="text-lg font-extrabold">Tijoloblock</Link>
        {/* Capa: uma faixa da grade do próprio movimento, com os primeiros blocos acesos. */}
        <div className="mt-6 max-w-sm opacity-90">
          <GridPreview blocks={Math.min(m.blocks, 120)} filled={Math.round(Math.min(m.blocks, 120) * 0.35)} />
        </div>
        <h1 className="mt-6 text-2xl leading-tight font-extrabold text-balance">{m.title}</h1>
        <p className="mt-2 text-cream/85">
          {MODE_LABEL[m.mode]}, {m.blocks} blocos, {formatBRL(totalOf(m.blocks))} no fim
        </p>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-2">
        <div className="rounded-field border-2 border-line p-3">
          <p className="num text-2xl font-extrabold">{m.participants.toLocaleString('pt-BR')}</p>
          <p className="text-sm text-muted">{m.participants === 1 ? 'pessoa participando' : 'pessoas participando'}</p>
        </div>
        <div className="rounded-field border-2 border-line p-3">
          <p className="text-lg font-extrabold">
            {starts ? starts.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : 'Já começou'}
          </p>
          <p className="text-sm text-muted">{upcoming ? 'começa' : 'começou'}</p>
        </div>
      </section>

      {m.description && <p className="mt-6 text-lg">{m.description}</p>}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Ranking</h2>
        <Ranking rows={m.ranking} />
        <p className="mt-2 text-xs text-muted">Pelo % concluído, nunca por valor. Quem prefere pode sair do ranking em Configurações.</p>
      </section>

      {(!ended || mine) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 backdrop-blur">
          <div className="mx-auto max-w-[760px] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {mine ? (
              <Link to={`/app/d/${mine}`} className="flex min-h-12 items-center justify-center rounded-field bg-forest px-5 font-semibold text-cream">
                Você já iniciou: continuar
              </Link>
            ) : (
              <Button className="w-full" disabled={busySlug === slug} aria-busy={busySlug === slug} onClick={() => join(slug, m)}>
                {busySlug === slug ? 'Iniciando…' : 'Iniciar movimento'}
              </Button>
            )}
          </div>
        </div>
      )}

      <MovementBalanceSheet ask={ask} fallbackBlocks={m.blocks} busy={busySlug !== null}
        onClose={closeAsk} onConfirm={startWithBalance} />
    </main>
  )
}

function Ranking({ rows }: { rows: RankRow[] }) {
  if (!rows.length) {
    return <p className="rounded-field border-2 border-dashed border-line p-4 text-muted">Ninguém marcou blocos ainda. Seja a primeira pessoa no ranking.</p>
  }
  return (
    <ol className="divide-y divide-line">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5">
          <span className={`num grid size-8 shrink-0 place-items-center rounded-block text-sm font-extrabold ${r.position <= 3 ? 'bg-gold text-forest' : 'border-2 border-line'}`}>
            {r.position}
          </span>
          <span className="flex-1 truncate">{r.display_name}</span>
          <span className="w-24">
            <span className="block h-2 overflow-hidden rounded-[3px] bg-line">
              <span className="block h-full bg-leaf" style={{ width: `${Math.min(100, r.pct)}%` }} />
            </span>
          </span>
          <span className="num w-14 text-right font-bold">{Number(r.pct).toLocaleString('pt-BR')}%</span>
        </li>
      ))}
    </ol>
  )
}
