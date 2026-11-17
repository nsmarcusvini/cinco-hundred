import { describe, expect, it } from 'vitest'
import { totalOf } from './blocks'
import {
  centsFromDigits, formatCents, initialBlocks, maxInitialCents, progressOf, validInitialCents,
} from './initialBalance'

const N = 500
const GOAL = 125_250

describe('limite do saldo inicial', () => {
  it('vai de R$ 0 a R$ 125.250, com centavos', () => {
    expect(maxInitialCents(N)).toBe(GOAL * 100)
    expect(validInitialCents(N, 0)).toBe(true)
    expect(validInitialCents(N, 1)).toBe(true)
    expect(validInitialCents(N, GOAL * 100)).toBe(true)
    expect(validInitialCents(N, GOAL * 100 + 1)).toBe(false)
    expect(validInitialCents(N, -1)).toBe(false)
    expect(validInitialCents(N, 10.5)).toBe(false)
    expect(() => initialBlocks(N, GOAL * 100 + 1)).toThrow(RangeError)
  })
})

describe('initialBlocks', () => {
  it('zero não fecha nenhum bloco', () => {
    expect(initialBlocks(N, 0)).toEqual({ blocks: [], covered: 0, leftoverCents: 0 })
  })

  it('fecha exato qualquer valor inteiro, do maior bloco para o menor', () => {
    expect(initialBlocks(N, 1_000_00).blocks).toEqual([500, 499, 1])
    for (const reais of [1, 2, 499, 500, 501, 999, 10_000, 62_625, 125_249]) {
      const r = initialBlocks(N, reais * 100)
      expect(r.covered).toBe(reais)
      expect(r.leftoverCents).toBe(0)
      expect(new Set(r.blocks).size).toBe(r.blocks.length) // sem bloco repetido
      expect(r.blocks.every((b) => b >= 1 && b <= N)).toBe(true)
    }
  })

  it('a meta inteira fecha todos os blocos', () => {
    const r = initialBlocks(N, GOAL * 100)
    expect(r.blocks).toHaveLength(N)
    expect(r.covered).toBe(GOAL)
  })

  it('com centavos, arredonda para baixo e nunca passa do declarado', () => {
    const r = initialBlocks(N, 10_000_99) // R$ 10.000,99
    expect(r.covered).toBe(10_000)
    expect(r.leftoverCents).toBe(99)
    expect(r.covered * 100).toBeLessThanOrEqual(10_000_99)

    expect(initialBlocks(N, 99)).toEqual({ blocks: [], covered: 0, leftoverCents: 99 }) // R$ 0,99
    expect(initialBlocks(N, GOAL * 100 - 1).covered).toBe(GOAL - 1) // R$ 125.249,99
  })

  it('serve para desafios de outro tamanho', () => {
    const r = initialBlocks(100, totalOf(100) * 100)
    expect(r.blocks).toHaveLength(100)
  })
})

describe('progressOf', () => {
  it('mostra na hora o percentual, o restante e os blocos do saldo inicial', () => {
    const { blocks } = initialBlocks(N, 62_625_50) // metade da meta + R$ 0,50
    const p = progressOf(N, blocks, [])
    expect(p.saved).toBe(62_625)
    expect(p.initialSaved).toBe(62_625)
    expect(p.markedSaved).toBe(0)
    expect(p.pct).toBe(50)
    expect(p.remaining).toBe(GOAL - 62_625)
    expect(p.filled).toBe(blocks.length)
  })

  it('marcações novas somam por cima do saldo inicial', () => {
    const { blocks } = initialBlocks(N, 1_000_00) // 500, 499, 1
    const p = progressOf(N, blocks, [2, 3])
    expect(p.saved).toBe(1_005)
    expect(p.markedSaved).toBe(5)
    expect(p.filled).toBe(5)
    expect(p.remaining).toBe(GOAL - 1_005)
  })

  it('nada conta duas vezes: bloco do saldo repetido nas marcações é ignorado', () => {
    const { blocks } = initialBlocks(N, 1_000_00)
    const p = progressOf(N, blocks, [500, 1, 2, 2])
    expect(p.saved).toBe(1_002)
    expect(p.initialSaved).toBe(1_000)
    expect(p.markedSaved).toBe(2)
    expect(p.filled).toBe(4)
  })

  it('nunca passa de 100%', () => {
    const { blocks } = initialBlocks(N, GOAL * 100)
    const p = progressOf(N, blocks, [1, 250, 500])
    expect(p.saved).toBe(GOAL)
    expect(p.pct).toBe(100)
    expect(p.remaining).toBe(0)
  })

  it('sem saldo inicial é o Desafio 500 de sempre', () => {
    const p = progressOf(N, [], [10, 20])
    expect(p.saved).toBe(30)
    expect(p.initialSaved).toBe(0)
  })
})

describe('campo de centavos', () => {
  it('lê os dígitos como centavos', () => {
    expect(centsFromDigits('')).toBeNull()
    expect(centsFromDigits('R$ 0,00')).toBe(0)
    expect(centsFromDigits('1234567')).toBe(1_234_567)
    expect(centsFromDigits('R$ 12.345,67')).toBe(1_234_567)
  })

  it('formata com centavos', () => {
    expect(formatCents(1_234_567)).toBe('R$ 12.345,67')
    expect(formatCents(0)).toBe('R$ 0,00')
  })
})
