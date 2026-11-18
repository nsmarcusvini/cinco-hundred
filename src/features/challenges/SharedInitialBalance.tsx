import { useEffect, useId, useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { Button, Choice } from '../../components/ui'
import { formatBRL } from '../../lib/format'
import { centsFromDigits, formatCents, sharedInitialBlocks } from '../../lib/initialBalance'

// Saldo inicial em dupla ou grupo: "Você já tem algum dinheiro guardado para este objetivo?".
// Os campos aparecem ao criar o desafio, ao entrar por convite, ao iniciar um movimento compartilhado e,
// depois, para corrigir o próprio valor na página do desafio. Quem grava é set_initial_balance.

export interface SharedBalance {
  has: boolean | null
  cents: number | null
}

export const EMPTY_BALANCE: SharedBalance = { has: null, cents: null }

/** Valor a gravar: 0 para "começar do zero", nulo enquanto a resposta estiver incompleta ou fora do limite. */
export function balanceToSave(v: SharedBalance, maxReais: number): number | null {
  if (v.has === false) return 0
  if (v.has !== true || v.cents === null) return null
  return v.cents >= 0 && v.cents <= maxReais * 100 ? v.cents : null
}

/**
 * A pergunta e o campo em R$, com os avisos antes de confirmar. `available` são os blocos abertos para a pessoa
 * (sem marcação e fora do saldo dos outros): o máximo é o que falta para a meta.
 */
export function SharedInitialBalanceFields({ value, onChange, available, autoFocus }: {
  value: SharedBalance
  onChange: (v: SharedBalance) => void
  available: number[]
  autoFocus?: boolean
}) {
  const id = useId()
  const max = available.reduce((t, b) => t + b, 0)
  const cents = value.has ? value.cents : null
  const valid = cents !== null && cents <= max * 100
  const preview = valid && cents > 0 ? sharedInitialBlocks(available, cents) : null

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-medium text-balance">Você já tem algum dinheiro guardado para este objetivo?</legend>
      <Choice<boolean> label="Você já tem algum dinheiro guardado para este objetivo?" value={value.has}
        onChange={(has) => onChange({ has, cents: has ? value.cents : null })}
        options={[{ value: true, label: 'Sim, já tenho' }, { value: false, label: 'Não, vou começar do zero' }]} />

      {value.has && (
        <div>
          <label htmlFor={`${id}-valor`} className="text-sm font-semibold">Quanto você já tem guardado para ele?</label>
          <input id={`${id}-valor`} type="text" inputMode="numeric" autoComplete="off" autoFocus={autoFocus}
            className="num mt-1 w-full border-b-2 border-line bg-transparent py-1 text-3xl font-extrabold outline-none focus:border-forest"
            placeholder="R$ 0,00" value={cents === null ? '' : formatCents(cents)}
            onChange={(e) => onChange({ has: true, cents: centsFromDigits(e.target.value) })}
            aria-invalid={cents !== null && !valid} aria-describedby={`${id}-ajuda`} />
          <p id={`${id}-ajuda`} className={`mt-2 text-sm ${cents !== null && !valid ? 'font-semibold text-danger' : 'text-muted'}`}>
            {cents !== null && !valid
              ? `O máximo agora é ${formatBRL(max)}, o que falta para a meta.`
              : 'Conte só o dinheiro que já está separado para este objetivo, não a sua reserva inteira.'}
          </p>
          {preview && (
            <p className="mt-2 text-sm" aria-live="polite">
              {preview.blocks.length === 0
                ? 'Esse valor ainda não fecha nenhum bloco.'
                : `Fecha ${preview.blocks.length} ${preview.blocks.length === 1 ? 'bloco' : 'blocos'} da grade, somando ${formatBRL(preview.covered)}.`}
              {preview.leftoverCents > 0 && ` Os ${formatCents(preview.leftoverCents)} que sobram não fecham bloco.`}
            </p>
          )}
          <ul className="mt-3 space-y-2 rounded-field bg-gold/20 p-3 text-sm">
            <li><strong>Fica visível para o grupo:</strong> todos os membros veem esse valor no progresso coletivo.</li>
            <li><strong>Não declare duas vezes:</strong> se outra pessoa do grupo já informou esse dinheiro, não informe de novo.</li>
          </ul>
        </div>
      )}

      {value.has !== null && (
        <p className="text-xs text-muted">
          O Tijoloblock não guarda nem movimenta dinheiro: o valor é declarado por você e não é verificado. O saldo inicial
          entra no progresso do grupo e nos rankings como blocos fechados, mas não na sequência nem nas conquistas.
          Você pode corrigir depois na página do desafio.
        </p>
      )}
    </fieldset>
  )
}

/** A mesma pergunta numa folha: movimento em dupla ou grupo e correção do próprio saldo. */
export function SharedInitialBalanceSheet({ open, title, available, currentCents, busy, onClose, onConfirm }: {
  open: boolean
  title: string
  available: number[]
  currentCents?: number
  busy: boolean
  onClose: () => void
  onConfirm: (cents: number) => void
}) {
  const [value, setValue] = useState<SharedBalance>(EMPTY_BALANCE)
  useEffect(() => {
    if (open) setValue(currentCents ? { has: true, cents: currentCents } : EMPTY_BALANCE)
  }, [open, currentCents])
  const max = available.reduce((t, b) => t + b, 0)
  const save = balanceToSave(value, max)

  return (
    <Sheet open={open} onOpenChange={onClose} title={title}>
      <form onSubmit={(e) => { e.preventDefault(); if (save !== null) onConfirm(save) }}>
        <SharedInitialBalanceFields value={value} onChange={setValue} available={available} autoFocus />
        <Button type="submit" className="mt-5 w-full" disabled={busy || save === null} aria-busy={busy}>
          {save ? `Confirmar ${formatCents(save)}` : currentCents ? 'Tirar meu saldo inicial' : 'Começar do zero'}
        </Button>
      </form>
    </Sheet>
  )
}
