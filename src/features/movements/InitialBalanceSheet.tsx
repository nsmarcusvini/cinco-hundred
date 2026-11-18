import { useMemo, useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { Button, Choice } from '../../components/ui'
import { totalOf } from '../../lib/blocks'
import { formatBRL } from '../../lib/format'
import { centsFromDigits, formatCents, initialBlocks, maxInitialCents, progressOf, validInitialCents } from '../../lib/initialBalance'
import { SharedInitialBalanceSheet } from '../challenges/SharedInitialBalance'

/**
 * Pergunta do movimento "Já comecei": a pessoa já tem dinheiro guardado? Se sim, informa quanto (com centavos)
 * e vê na hora o percentual, o que falta e os blocos que o saldo fecha. Quem confirma é a página do movimento.
 */
export function InitialBalanceSheet({ open, blocks, busy, onClose, onConfirm }: {
  open: boolean
  blocks: number
  busy: boolean
  onClose: () => void
  onConfirm: (cents: number) => void
}) {
  const [has, setHas] = useState<boolean | null>(null)
  const [cents, setCents] = useState<number | null>(null)
  const max = maxInitialCents(blocks)
  const valid = cents !== null && validInitialCents(blocks, cents)
  const amount = has ? cents : 0

  const preview = useMemo(() => {
    if (!has || !valid) return null
    const r = initialBlocks(blocks, cents)
    return { ...r, set: new Set(r.blocks), progress: progressOf(blocks, r.blocks, []) }
  }, [has, valid, blocks, cents])

  const close = () => {
    setHas(null)
    setCents(null)
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={close} title="Você já tem dinheiro guardado?">
      <form onSubmit={(e) => { e.preventDefault(); if (amount !== null && (has === false || valid)) onConfirm(amount) }}>
        <p className="mb-4 text-muted">
          Se já guardou parte dos {formatBRL(totalOf(blocks))}, informe o valor: a grade começa com esses blocos fechados.
        </p>
        <Choice<boolean> label="Já tem dinheiro guardado?" value={has} onChange={setHas}
          options={[{ value: true, label: 'Sim, já tenho' }, { value: false, label: 'Ainda não' }]} />

        {has && (
          <div className="mt-6">
            <label htmlFor="saldo-inicial" className="text-sm font-semibold">Quanto você já tem guardado?</label>
            <input id="saldo-inicial" type="text" inputMode="numeric" autoComplete="off" autoFocus
              className="num mt-1 w-full border-b-2 border-line bg-transparent py-1 text-3xl font-extrabold outline-none focus:border-forest"
              placeholder="R$ 0,00" value={cents === null ? '' : formatCents(cents)}
              onChange={(e) => setCents(centsFromDigits(e.target.value))}
              aria-invalid={cents !== null && !valid} aria-describedby="saldo-ajuda" />
            <p id="saldo-ajuda" className={`mt-2 text-sm ${cents !== null && !valid ? 'font-semibold text-danger' : 'text-muted'}`}>
              {cents !== null && !valid ? `O máximo é ${formatCents(max)}, a meta inteira.` : `De R$ 0,00 a ${formatCents(max)}.`}
            </p>
          </div>
        )}

        {preview && (
          <section aria-live="polite" className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="num text-2xl font-extrabold">{fmtPct(preview.progress.pct)}</p>
              <p className="text-sm text-muted">faltam <span className="num font-semibold text-ink">{formatBRL(preview.progress.remaining)}</span></p>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-[3px] bg-line" role="progressbar"
              aria-valuenow={Math.floor(preview.progress.pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-gold" style={{ width: `${preview.progress.pct}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-[repeat(25,minmax(0,1fr))] gap-[2px]" aria-hidden>
              {Array.from({ length: blocks }, (_, i) => (
                <span key={i} className={`aspect-square rounded-[1px] ${preview.set.has(i + 1) ? 'bg-leaf' : 'bg-line'}`} />
              ))}
            </div>
            <p className="mt-3 text-sm">
              {preview.blocks.length === 0
                ? 'Esse valor ainda não fecha nenhum bloco. Tudo bem: você começa marcando o primeiro.'
                : `${preview.blocks.length} ${preview.blocks.length === 1 ? 'bloco fechado' : 'blocos fechados'}, somando ${formatBRL(preview.covered)}.`}
              {preview.leftoverCents > 0 && preview.blocks.length > 0 && ` Os ${formatCents(preview.leftoverCents)} que sobram não fecham bloco e ficam de fora.`}
            </p>
          </section>
        )}

        {has !== null && (
          <p className="mt-4 text-xs text-muted">
            O valor exato só você vê. Os blocos do saldo contam no seu progresso e nos rankings, mas não na sequência nem
            nas conquistas: lá entram só os blocos que você marcar daqui pra frente. O Tijoloblock não guarda nem movimenta dinheiro.
          </p>
        )}

        <Button type="submit" className="mt-5 w-full" disabled={busy || has === null || (has && !valid)}>
          {has && valid && cents > 0 ? `Começar com ${formatCents(cents)}` : 'Começar do zero'}
        </Button>
      </form>
    </Sheet>
  )
}

/**
 * A pergunta certa ao iniciar um movimento: o "Já comecei" (individual) ou, em dupla/grupo, o saldo de cada um.
 * Num movimento recém-iniciado a grade está vazia, então todos os blocos estão abertos.
 */
export function MovementBalanceSheet({ ask, fallbackBlocks, busy, onClose, onConfirm }: {
  ask: { blocks: number; shared: boolean } | null
  fallbackBlocks: number
  busy: boolean
  onClose: () => void
  onConfirm: (cents: number) => void
}) {
  const blocks = ask?.blocks ?? fallbackBlocks
  const all = useMemo(() => Array.from({ length: blocks }, (_, i) => i + 1), [blocks])
  if (ask?.shared) {
    return <SharedInitialBalanceSheet open title="Antes de começar" available={all} busy={busy} onClose={onClose} onConfirm={onConfirm} />
  }
  return <InitialBalanceSheet open={ask !== null} blocks={blocks} busy={busy} onClose={onClose} onConfirm={onConfirm} />
}

/** 12,3% (para baixo: nunca mostra mais do que foi guardado). */
const fmtPct = (pct: number) => `${(Math.floor(pct * 10) / 10).toLocaleString('pt-BR')}%`
