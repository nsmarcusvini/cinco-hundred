// Gamificação: a obra (cada bloco marcado é um tijolo) e as conquistas. Funções puras.
// Tudo conta hábito (quantos blocos, quantas semanas), não valor: quem ganha menos sobe igual.

export interface Level {
  name: string
  from: number // blocos marcados para chegar ao nível
}

export const LEVELS: Level[] = [
  { name: 'Alicerce', from: 0 },
  { name: 'Parede', from: 10 },
  { name: 'Casa', from: 40 },
  { name: 'Sobrado', from: 100 },
  { name: 'Prédio', from: 250 },
  { name: 'Arranha-céu', from: 500 },
]

export interface Obra {
  level: Level
  index: number
  next: Level | null
  /** 0..1 do caminho entre o nível atual e o próximo (1 no último nível). */
  progress: number
  toNext: number
}

export function obraFor(bricks: number): Obra {
  let index = 0
  while (index + 1 < LEVELS.length && bricks >= LEVELS[index + 1].from) index++
  const level = LEVELS[index]
  const next = LEVELS[index + 1] ?? null
  if (!next) return { level, index, next, progress: 1, toNext: 0 }
  return { level, index, next, progress: (bricks - level.from) / (next.from - level.from), toNext: next.from - bricks }
}

export interface Mark {
  block: number
  marked_at: string
  challenge_id: string
}

export interface ChallengeInfo {
  id: string
  owner_id: string
  blocks: number
  status: string
  saved: number // soma de todos os participantes
  memberCount: number
}

export interface Achievement {
  id: string
  title: string
  description: string
  unlocked: boolean
}

/** Semana local (começa na segunda) como número sequencial, para achar semanas seguidas. */
export function weekNumber(d: Date): number {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const monday = new Date(day)
  monday.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return Math.round(monday.getTime() / (7 * 24 * 3600_000))
}

/** Maior sequência de semanas seguidas com pelo menos uma marcação. */
export function longestWeekRun(markedAt: string[]): number {
  const weeks = [...new Set(markedAt.map((t) => weekNumber(new Date(t))))].sort((a, b) => a - b)
  let best = 0
  let run = 0
  weeks.forEach((w, i) => {
    run = i > 0 && w === weeks[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  })
  return best
}

const monthOf = (t: string) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}`
}

export function achievements({ uid, marks, challenges, monthly }: {
  uid: string
  marks: Mark[] // só as marcações da própria pessoa
  challenges: ChallengeInfo[]
  monthly: number | null // meta mensal do plano ativo
}): Achievement[] {
  const byMonth = new Map<string, number>()
  for (const m of marks) byMonth.set(monthOf(m.marked_at), (byMonth.get(monthOf(m.marked_at)) ?? 0) + m.block)
  const monthsHit = monthly && monthly > 0 ? [...byMonth.values()].filter((v) => v >= monthly).length : 0
  const weeks = longestWeekRun(marks.map((m) => m.marked_at))
  const goal = (c: ChallengeInfo) => (c.blocks * (c.blocks + 1)) / 2

  const list: (Omit<Achievement, 'unlocked'> & { ok: boolean })[] = [
    { id: 'primeiro-bloco', title: 'Primeiro tijolo', description: 'Marcou o primeiro bloco.', ok: marks.length >= 1 },
    { id: 'dez-blocos', title: 'Dez tijolos', description: 'Marcou 10 blocos.', ok: marks.length >= 10 },
    { id: 'cem-blocos', title: 'Cem tijolos', description: 'Marcou 100 blocos.', ok: marks.length >= 100 },
    { id: 'quatro-semanas', title: 'Um mês de hábito', description: 'Guardou em 4 semanas seguidas.', ok: weeks >= 4 },
    { id: 'doze-semanas', title: 'Hábito de verdade', description: 'Guardou em 12 semanas seguidas.', ok: weeks >= 12 },
    { id: 'meta-mes', title: 'Meta batida', description: 'Bateu a meta do mês do seu plano.', ok: monthsHit >= 1 },
    { id: 'meta-tres', title: 'Três metas', description: 'Bateu a meta do mês 3 vezes.', ok: monthsHit >= 3 },
    { id: 'metade', title: 'Meio caminho', description: 'Chegou a 50% de um desafio.', ok: challenges.some((c) => c.saved >= goal(c) / 2) },
    { id: 'desafio-completo', title: 'Obra entregue', description: 'Completou um desafio.', ok: challenges.some((c) => c.status === 'completed') },
    { id: 'bloco-500', title: 'O maior tijolo', description: 'Marcou o bloco 500.', ok: marks.some((m) => m.block === 500) },
    { id: 'chamou-alguem', title: 'Mestre de obras', description: 'Alguém entrou num desafio seu.', ok: challenges.some((c) => c.owner_id === uid && c.memberCount >= 2) },
    { id: 'em-equipe', title: 'Em equipe', description: 'Participa de um desafio com outras pessoas.', ok: challenges.some((c) => c.memberCount >= 2) },
  ]
  return list.map(({ ok, ...a }) => ({ ...a, unlocked: ok }))
}
