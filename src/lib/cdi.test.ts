import { describe, expect, it } from 'vitest'
import { cdiEarnings, formatCents, formatRate } from './cdi'

describe('rendimento a 100% do CDI', () => {
  it('R$ 100 mil a 13,65% a.a.', () => {
    const e = cdiEarnings(100_000, 0.1365)
    expect(e.perDay).toBeCloseTo(50.78, 1)
    expect(e.perMonth).toBeCloseTo(1072, 0)
    expect(e.perYear).toBeCloseTo(13650, 6)
  })
  it('252 dias úteis compõem exatamente a taxa anual', () => {
    const daily = cdiEarnings(1, 0.1365).perDay
    expect((1 + daily) ** 252 - 1).toBeCloseTo(0.1365, 10)
  })
  it('é proporcional ao valor guardado', () => {
    expect(cdiEarnings(10_000).perDay * 10).toBeCloseTo(cdiEarnings(100_000).perDay, 10)
  })
  it('formatação', () => {
    expect(formatRate(0.1365)).toBe('13,65%')
    expect(formatCents(50.7812)).toBe('R$ 50,78')
    expect(formatCents(1072.4)).toBe('R$ 1.072,40')
  })
})
