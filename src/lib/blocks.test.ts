import { describe, expect, it } from 'vitest'
import { crossedMilestone, streak, suggestBlocks, totalOf } from './blocks'

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('suggestBlocks', () => {
  it('aceite 4: "Guardei R$ 300" com tudo livre usa o bloco 300', () => {
    expect(suggestBlocks(range(1, 500), 300)).toEqual({ blocks: [300], total: 300, remainder: 0 })
  })

  it('bloco V marcado: procura um par que some V', () => {
    const free = range(1, 500).filter((b) => b !== 300)
    const s = suggestBlocks(free, 300)
    expect(s.blocks).toHaveLength(2)
    expect(sum(s.blocks)).toBe(300)
    expect(new Set(s.blocks).size).toBe(2)
    expect(s.blocks.every((b) => free.includes(b))).toBe(true)
  })

  it('valor acima do maior bloco livre: par com os maiores possíveis', () => {
    const s = suggestBlocks(range(1, 100), 150)
    expect(s.blocks).toEqual([100, 50])
    expect(s.remainder).toBe(0)
  })

  it('sem par possível: guloso do maior para o menor', () => {
    const s = suggestBlocks([1, 2, 10, 20, 100], 133)
    expect(s.blocks).toEqual([100, 20, 10, 2, 1])
    expect(s.total).toBe(133)
    expect(s.remainder).toBe(0)
  })

  it('quando não fecha, avisa a diferença e soma por baixo', () => {
    const s = suggestBlocks([5, 10, 50], 68)
    expect(s.blocks).toEqual([50, 10, 5])
    expect(s.total).toBe(65)
    expect(s.remainder).toBe(3)
  })

  it('valor menor que o menor bloco livre não sugere nada', () => {
    expect(suggestBlocks([10, 20], 7)).toEqual({ blocks: [], total: 0, remainder: 7 })
  })

  it('nunca repete bloco nem usa bloco marcado', () => {
    const free = range(1, 500).filter((b) => b % 3 !== 0)
    for (const v of [1, 3, 299, 600, 1234, 5000]) {
      const s = suggestBlocks(free, v)
      expect(new Set(s.blocks).size).toBe(s.blocks.length)
      expect(s.blocks.every((b) => free.includes(b))).toBe(true)
      expect(sum(s.blocks)).toBe(s.total)
      expect(s.total + s.remainder).toBe(v)
    }
  })

  it('valor zero, negativo ou grade cheia', () => {
    expect(suggestBlocks(range(1, 10), 0).blocks).toEqual([])
    expect(suggestBlocks([], 100)).toEqual({ blocks: [], total: 0, remainder: 100 })
  })
})

describe('totalOf', () => {
  it('500 blocos = R$ 125.250', () => {
    expect(totalOf(500)).toBe(125250)
    expect(totalOf(447)).toBe(100128)
  })
})

describe('streak', () => {
  const tz = 'America/Sao_Paulo'
  const now = new Date('2026-10-27T15:00:00-03:00')

  it('conta dias seguidos até hoje', () => {
    const marks = ['2026-10-27T09:00:00-03:00', '2026-10-26T22:00:00-03:00', '2026-10-25T08:00:00-03:00']
    expect(streak(marks, tz, now)).toBe(3)
  })

  it('se hoje ainda não marcou, conta a partir de ontem', () => {
    expect(streak(['2026-10-26T22:00:00-03:00', '2026-10-25T08:00:00-03:00'], tz, now)).toBe(2)
  })

  it('um buraco zera a sequência', () => {
    expect(streak(['2026-10-27T09:00:00-03:00', '2026-10-25T08:00:00-03:00'], tz, now)).toBe(1)
    expect(streak(['2026-10-24T09:00:00-03:00'], tz, now)).toBe(0)
  })

  it('usa o fuso do usuário (23h em SP já é amanhã em UTC)', () => {
    // 2026-10-26 23:30 em SP = 2026-10-27 02:30 UTC: conta como dia 26.
    expect(streak(['2026-10-27T02:30:00Z', '2026-10-27T12:00:00Z'], tz, now)).toBe(2)
  })
})

describe('crossedMilestone', () => {
  it('detecta o maior marco cruzado', () => {
    expect(crossedMilestone(9, 11)).toBe(10)
    expect(crossedMilestone(20, 60)).toBe(50)
    expect(crossedMilestone(99, 100)).toBe(100)
    expect(crossedMilestone(11, 20)).toBeNull()
  })
})
