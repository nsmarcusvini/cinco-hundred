import { describe, expect, it } from 'vitest'
import { totalOf } from './blocks'
import { groupInitial, progressOf, sharedInitialBlocks } from './initialBalance'
import { balanceToSave } from '../features/challenges/SharedInitialBalance'

const N = 500
const all = Array.from({ length: N }, (_, i) => i + 1)

describe('saldo inicial em dupla/grupo', () => {
  it('A com R$ 5.000 e B com R$ 3.000 dão R$ 8.000 de partida, sem bloco repetido', () => {
    const a = sharedInitialBlocks(all, 5_000_00)
    const freeForB = all.filter((b) => !a.blocks.includes(b))
    const b = sharedInitialBlocks(freeForB, 3_000_00)
    expect(a.covered).toBe(5000)
    expect(b.covered).toBe(3000)
    const g = groupInitial([
      { user_id: 'a', amount_cents: 5_000_00, blocks: a.blocks },
      { user_id: 'b', amount_cents: 3_000_00, blocks: b.blocks },
    ])
    expect(g.declaredCents).toBe(8_000_00)
    expect(g.covered).toBe(8000)
    expect(new Set(g.blocks).size).toBe(a.blocks.length + b.blocks.length)
    const p = progressOf(N, g.blocks, [10, 20])
    expect(p.initialSaved).toBe(8000)
    expect(p.markedSaved).toBe(30)
    expect(p.remaining).toBe(totalOf(N) - 8030)
  })

  it('centavos ficam fora dos blocos, mas no valor declarado', () => {
    const r = sharedInitialBlocks(all, 1_234_56)
    expect(r.covered).toBe(1234)
    expect(r.leftoverCents).toBe(56)
  })

  it('o limite é o que está aberto: o total nunca passa da meta', () => {
    const open = [3, 7, 100]
    expect(() => sharedInitialBlocks(open, 111 * 100)).toThrow(RangeError)
    expect(sharedInitialBlocks(open, 110 * 100).covered).toBe(110)
    expect(sharedInitialBlocks(open, 5 * 100)).toEqual({ blocks: [3], covered: 3, leftoverCents: 200 })
  })

  it('corrigir substitui: os blocos atuais da pessoa contam como abertos', () => {
    const first = sharedInitialBlocks(all, 2_000_00)
    const again = sharedInitialBlocks(all, 1_000_00)
    expect(again.covered).toBe(1000)
    expect(first.covered).toBe(2000)
  })

  it('uma linha por pessoa no total do grupo', () => {
    const g = groupInitial([
      { user_id: 'a', amount_cents: 100_00, blocks: [100] },
      { user_id: 'a', amount_cents: 50_00, blocks: [50] },
    ])
    expect(g.declaredCents).toBe(50_00)
  })

  it('a resposta: zero para começar do zero, nula se incompleta ou acima do limite', () => {
    expect(balanceToSave({ has: false, cents: null }, 1000)).toBe(0)
    expect(balanceToSave({ has: null, cents: null }, 1000)).toBeNull()
    expect(balanceToSave({ has: true, cents: null }, 1000)).toBeNull()
    expect(balanceToSave({ has: true, cents: 1000_01 }, 1000)).toBeNull()
    expect(balanceToSave({ has: true, cents: 999_99 }, 1000)).toBe(999_99)
  })
})
