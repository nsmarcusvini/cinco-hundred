import { describe, expect, it } from 'vitest'
import { achievements, longestWeekRun, obraFor, type ChallengeInfo, type Mark } from './obra'

describe('obra', () => {
  it('começa no alicerce', () => {
    const o = obraFor(0)
    expect(o.level.name).toBe('Alicerce')
    expect(o.next?.name).toBe('Parede')
    expect(o.toNext).toBe(10)
    expect(o.progress).toBe(0)
  })
  it('sobe de nível no limite exato', () => {
    expect(obraFor(9).level.name).toBe('Alicerce')
    expect(obraFor(10).level.name).toBe('Parede')
    expect(obraFor(100).level.name).toBe('Sobrado')
  })
  it('progresso dentro do nível', () => {
    const o = obraFor(25) // Parede (10) → Casa (40)
    expect(o.progress).toBeCloseTo(0.5)
    expect(o.toNext).toBe(15)
  })
  it('último nível fica completo', () => {
    const o = obraFor(800)
    expect(o.level.name).toBe('Arranha-céu')
    expect(o.next).toBeNull()
    expect(o.progress).toBe(1)
  })
})

describe('semanas seguidas', () => {
  it('conta a maior sequência e ignora duas marcações na mesma semana', () => {
    // 5, 7 (mesma semana), 13 e 20 de outubro de 2026 = 3 semanas; depois um buraco e mais 1.
    const at = ['2026-10-05', '2026-10-07', '2026-10-13', '2026-10-20', '2026-11-09'].map((d) => `${d}T12:00:00`)
    expect(longestWeekRun(at)).toBe(3)
  })
  it('sem marcações', () => {
    expect(longestWeekRun([])).toBe(0)
  })
})

describe('conquistas', () => {
  const uid = 'eu'
  const mark = (block: number, day: string): Mark => ({ block, marked_at: `${day}T12:00:00`, challenge_id: 'c1' })
  const c = (over: Partial<ChallengeInfo> = {}): ChallengeInfo => ({
    id: 'c1', owner_id: uid, blocks: 100, status: 'active', saved: 0, memberCount: 1, ...over,
  })
  const ids = (a: ReturnType<typeof achievements>) => a.filter((x) => x.unlocked).map((x) => x.id)

  it('nada desbloqueado no começo', () => {
    expect(ids(achievements({ uid, marks: [], challenges: [], monthly: 1000 }))).toEqual([])
  })
  it('primeiro tijolo e meta do mês', () => {
    const got = ids(achievements({ uid, marks: [mark(600, '2026-10-02'), mark(450, '2026-10-20')], challenges: [c()], monthly: 1000 }))
    expect(got).toContain('primeiro-bloco')
    expect(got).toContain('meta-mes')
    expect(got).not.toContain('meta-tres')
  })
  it('metade e desafio completo usam o total do grupo', () => {
    const got = ids(achievements({ uid, marks: [], challenges: [c({ saved: 2525 }), c({ id: 'c2', status: 'completed' })], monthly: null }))
    expect(got).toEqual(expect.arrayContaining(['metade', 'desafio-completo']))
  })
  it('mestre de obras só para quem é dono do grupo', () => {
    const dono = ids(achievements({ uid, marks: [], challenges: [c({ memberCount: 2 })], monthly: null }))
    const convidado = ids(achievements({ uid, marks: [], challenges: [c({ owner_id: 'outra', memberCount: 2 })], monthly: null }))
    expect(dono).toEqual(expect.arrayContaining(['chamou-alguem', 'em-equipe']))
    expect(convidado).toEqual(['em-equipe'])
  })
  it('sem plano, metas do mês não desbloqueiam', () => {
    expect(ids(achievements({ uid, marks: [mark(5000, '2026-10-02')], challenges: [], monthly: null }))).not.toContain('meta-mes')
  })
})
