// Saldo inicial declarado ("Já comecei"): quem já tem dinheiro guardado entra no movimento com parte da grade
// preenchida. O saldo vira blocos fechados, separados das marcações: não conta para sequência, conquistas nem rankings.
// A mesma regra roda no banco (start_movement_with_balance); os testes garantem que as duas batem.

import { totalOf } from './blocks'

export interface InitialBalance {
  amount_cents: number // valor declarado, com centavos
  blocks: number[] // blocos cobertos pelo saldo, em ordem decrescente
}

/** Limite do saldo declarado: a meta inteira do desafio, em centavos. */
export const maxInitialCents = (n: number) => totalOf(n) * 100

/** Campo com máscara de centavos: "1234567" vira 1234567 centavos (R$ 12.345,67). Nulo se vazio. */
export function centsFromDigits(text: string): number | null {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9)
  return digits ? Number(digits) : null
}

const brlCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

/** R$ 12.345,67 */
export const formatCents = (cents: number) => brlCents.format(cents / 100).replace(/\s/, ' ')

/** O valor cabe no saldo inicial do desafio de n blocos (de R$ 0 até a meta, inclusive). */
export const validInitialCents = (n: number, cents: number) =>
  Number.isInteger(cents) && cents >= 0 && cents <= maxInitialCents(n)

/**
 * Blocos que representam o saldo: do maior para o menor, enquanto couber.
 * Como os blocos vão de 1 a n, todo valor inteiro até a meta fecha exato; só os centavos ficam de fora.
 * Arredonda sempre para baixo: os blocos nunca somam mais do que foi declarado.
 */
export function initialBlocks(n: number, cents: number): { blocks: number[]; covered: number; leftoverCents: number } {
  if (!validInitialCents(n, cents)) throw new RangeError('Saldo inicial fora do limite')
  let rest = Math.floor(cents / 100)
  const blocks: number[] = []
  for (let b = n; b >= 1 && rest > 0; b--) {
    if (b <= rest) {
      blocks.push(b)
      rest -= b
    }
  }
  const covered = blocks.reduce((t, b) => t + b, 0)
  return { blocks, covered, leftoverCents: cents - covered * 100 }
}

export interface Progress {
  saved: number // reais representados na grade (saldo inicial em blocos + marcações)
  initialSaved: number // parte que veio do saldo inicial
  markedSaved: number // parte que veio de marcações novas
  filled: number // blocos fechados
  remaining: number // quanto falta para a meta
  pct: number // 0 a 100, sem arredondar
}

/**
 * Progresso do desafio somando saldo inicial e marcações. Um bloco conta uma vez só:
 * se uma marcação repetir um bloco do saldo (não deveria, o banco recusa), ela é ignorada.
 */
export function progressOf(n: number, initial: number[], marks: number[]): Progress {
  const goal = totalOf(n)
  const initialSet = new Set(initial.filter((b) => b >= 1 && b <= n))
  const markSet = new Set(marks.filter((b) => b >= 1 && b <= n && !initialSet.has(b)))
  const initialSaved = [...initialSet].reduce((t, b) => t + b, 0)
  const markedSaved = [...markSet].reduce((t, b) => t + b, 0)
  const saved = initialSaved + markedSaved
  return {
    saved,
    initialSaved,
    markedSaved,
    filled: initialSet.size + markSet.size,
    remaining: goal - saved,
    pct: (saved / goal) * 100,
  }
}
