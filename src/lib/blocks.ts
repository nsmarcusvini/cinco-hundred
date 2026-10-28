// Regras puras da grade: soma, sugestão de blocos ("Guardei R$ X") e sequência de dias.

/** Soma de 1 a n: a meta de um desafio de n blocos. */
export const totalOf = (n: number) => (n * (n + 1)) / 2

export interface Suggestion {
  blocks: number[] // em ordem decrescente
  total: number
  remainder: number // quanto do valor ficou sem bloco
}

/**
 * Blocos livres que somam `value` (seção 6.1):
 * 1) o próprio bloco `value`; 2) um par a + b; 3) guloso do maior para o menor.
 * `free` precisa estar em ordem crescente.
 */
export function suggestBlocks(free: number[], value: number): Suggestion {
  const v = Math.floor(value)
  if (v <= 0 || free.length === 0) return { blocks: [], total: 0, remainder: Math.max(0, v) }

  if (binarySearch(free, v) >= 0) return { blocks: [v], total: v, remainder: 0 }

  for (let i = 0, j = free.length - 1; i < j; ) {
    const s = free[i] + free[j]
    if (s === v) return { blocks: [free[j], free[i]], total: v, remainder: 0 }
    if (s < v) i++
    else j--
  }

  const blocks: number[] = []
  let rest = v
  let hi = free.length - 1
  while (rest > 0 && hi >= 0) {
    hi = Math.min(hi, upperIndex(free, rest)) // maior bloco <= rest, abaixo dos já usados
    if (hi < 0) break
    blocks.push(free[hi])
    rest -= free[hi]
    hi--
  }
  return { blocks, total: v - rest, remainder: rest }
}

function binarySearch(xs: number[], x: number): number {
  let lo = 0, hi = xs.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (xs[mid] === x) return mid
    if (xs[mid] < x) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}

/** Índice do maior elemento <= x (ou -1). */
function upperIndex(xs: number[], x: number): number {
  let lo = 0, hi = xs.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** "AAAA-MM-DD" no fuso do usuário. */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/**
 * Dias seguidos com pelo menos uma marcação (seção 6.7).
 * Se hoje ainda não marcou, conta a partir de ontem.
 */
export function streak(markedAt: string[], timeZone: string, now = new Date()): number {
  const days = new Set(markedAt.map((t) => dayKey(new Date(t), timeZone)))
  const cursor = new Date(now)
  if (!days.has(dayKey(cursor, timeZone))) cursor.setUTCDate(cursor.getUTCDate() - 1)
  let count = 0
  while (days.has(dayKey(cursor, timeZone))) {
    count++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return count
}

export const MILESTONES = [10, 25, 50, 75, 90, 100] as const

/** Marco de % cruzado ao passar de `before` para `after` (o maior, se cruzou mais de um). */
export function crossedMilestone(before: number, after: number): number | null {
  const crossed = MILESTONES.filter((m) => before < m && after >= m)
  return crossed.length ? crossed[crossed.length - 1] : null
}
