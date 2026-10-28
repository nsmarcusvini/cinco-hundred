import { describe, expect, it } from 'vitest'
import {
  belowHalfTwoMonths, blocksPace, computePlan, milestones, monthKey, monthStatus, monthsToReach, monthsWithPartner, validatePlanInput,
  type PlanInput,
} from './plan'

const base: PlanInput = {
  income: 5000,
  fixed: [{ category: 'moradia', amount: 2800 }],
  variable: null,
  currentSavings: 0,
  hasEmergencyFund: true,
  hasHighInterestDebt: false,
}

describe('computePlan', () => {
  it('aceite 1.1: renda 5.000, fixos 2.800, variáveis estimados', () => {
    const p = computePlan(base)
    expect(p.variaveis).toBe(750)
    expect(p.variableEstimated).toBe(true)
    expect(p.sobra).toBe(1450)
    expect(p.scenarios.leve.monthly).toBe(720)
    expect(p.scenarios.recomendado.monthly).toBe(1160)
    expect(p.scenarios.acelerado.monthly).toBe(1450)
    expect(p.scenarios.recomendado.monthsNoYield).toBe(108)
    expect(p.scenarios.recomendado.monthsWithYield).toBe(79)
    expect(p.status).toBe('ok')
    expect(p.recommendedBlocks).toBe(250)
    expect(p.ladder).toEqual([250, 500])
    expect(p.rule20).toBe(1000)
    expect(p.comprometimento).toBeCloseTo(0.71)
  })

  it('prazo até 5 anos começa direto no 500', () => {
    const p = computePlan({ ...base, income: 10000, fixed: [{ category: 'moradia', amount: 3000 }], variable: [{ category: 'lazer', amount: 1000 }] })
    expect(p.variableEstimated).toBe(false)
    expect(p.scenarios.recomendado.monthly).toBe(4800)
    expect(p.scenarios.recomendado.monthsNoYield).toBe(27)
    expect(p.ladder).toEqual([500])
  })

  it('resgate: sobra <= 0 não recomenda os 125 mil', () => {
    const input = { ...base, income: 3000, fixed: [{ category: 'moradia', amount: 2000 }, { category: 'dividas_parcelas', amount: 1200 }] }
    const p = computePlan(input)
    expect(p.status).toBe('resgate')
    expect(p.ladder).toEqual([100])
    expect(p.recommendedBlocks).toBe(100)
    expect(p.scenarios.recomendado.monthly).toBe(0)
    expect(p.scenarios.recomendado.monthsNoYield).toBeNull()
    expect(p.topCategories.map((c) => c.category)).toEqual(['moradia', 'dividas_parcelas'])
    expect(validatePlanInput(input).warnings).toHaveLength(1)
  })

  it('apertado: aporte recomendado < R$ 300 vira escada 100 → 250 → 500', () => {
    const p = computePlan({ ...base, income: 2000, fixed: [{ category: 'moradia', amount: 1500 }], variable: [{ category: 'lazer', amount: 200 }] })
    expect(p.scenarios.recomendado.monthly).toBe(240)
    expect(p.status).toBe('apertado')
    expect(p.ladder).toEqual([100, 250, 500])
  })

  it('apertado: prazo acima de 15 anos', () => {
    const p = computePlan({ ...base, income: 2000, fixed: [{ category: 'moradia', amount: 1500 }], variable: [] })
    expect(p.scenarios.recomendado.monthly).toBe(400)
    expect(p.scenarios.recomendado.monthsNoYield).toBe(314)
    expect(p.status).toBe('apertado')
  })

  it('saldo inicial encurta o prazo e pode mudar o desafio recomendado', () => {
    const with50k = computePlan({ ...base, currentSavings: 50000 })
    expect(with50k.scenarios.recomendado.monthsNoYield).toBe(65)
    expect(with50k.ladder).toEqual([250, 500])
    const with60k = computePlan({ ...base, currentSavings: 60000 })
    expect(with60k.scenarios.recomendado.monthsNoYield).toBe(57)
    expect(with60k.ladder).toEqual([500])
  })

  it('dívida com juros altos sugere o cenário Leve', () => {
    expect(computePlan(base).suggested).toBe('recomendado')
    expect(computePlan({ ...base, hasHighInterestDebt: true }).suggested).toBe('leve')
  })

  it('sem reserva (ou não sei): alvo = fixos × 6 meses', () => {
    expect(computePlan(base).emergencyTarget).toBeNull()
    expect(computePlan({ ...base, hasEmergencyFund: false }).emergencyTarget).toBe(16800)
    expect(computePlan({ ...base, hasEmergencyFund: null }).emergencyTarget).toBe(16800)
  })

  it('arredonda os cenários para baixo em múltiplos de R$ 10', () => {
    const p = computePlan({ ...base, income: 5005 }) // sobra 1454,25
    expect(p.scenarios.recomendado.monthly).toBe(1160)
    expect(p.scenarios.leve.monthly).toBe(720)
  })
})

describe('milestones', () => {
  it('marca a reserva antes do resto e termina na meta', () => {
    const p = computePlan({ ...base, hasEmergencyFund: false })
    const m = milestones(p, 1160, 0, 0)
    expect(m.map((x) => x.key)).toEqual(['reserva', '25', '50', '100mil', 'meta'])
    expect(m[0].month).toBe(15) // 16.800 / 1.160
    expect(m.at(-1)!.month).toBe(108)
  })
})

describe('monthsToReach', () => {
  it('já atingido = 0; sem aporte e sem rendimento = nunca', () => {
    expect(monthsToReach(1000, 1000, 0, 0)).toBe(0)
    expect(monthsToReach(1000, 0, 0, 0.008)).toBeNull()
  })
  it('rendimento sozinho também chega (saldo inicial > 0)', () => {
    expect(monthsToReach(2000, 1000, 0, 0.01)).toBe(70)
  })
})

describe('validatePlanInput', () => {
  it('renda fora da faixa e nenhum gasto fixo são erros', () => {
    expect(validatePlanInput({ ...base, income: 0, fixed: [] }).errors).toHaveLength(2)
    expect(validatePlanInput({ ...base, income: 2_000_000 }).errors).toHaveLength(1)
    expect(validatePlanInput(base)).toEqual({ errors: [], warnings: [] })
  })
})

describe('auxiliares', () => {
  it('blocos por mês e semana', () => {
    expect(blocksPace(1252.5).perMonth).toBe(5)
    expect(blocksPace(1252.5).perWeek).toBeCloseTo(1.15)
  })
  it('com parceiro, o prazo cai pela metade', () => {
    expect(monthsWithPartner(1160, 0)).toBe(54)
  })
  it('status do mês', () => {
    expect(monthStatus(1250, 480, 15, 30)).toBe('atrasado')
    expect(monthStatus(1250, 700, 15, 30)).toBe('em_dia')
    expect(monthStatus(1250, 1250, 5, 30)).toBe('adiantado')
  })
})

describe('check-in mensal', () => {
  const now = new Date(2026, 9, 3) // 3 de outubro
  const start = new Date(2026, 6, 10) // plano de julho
  it('chave do mês', () => {
    expect(monthKey(new Date(2026, 0, 31))).toBe('2026-01')
  })
  it('sugere o Leve com 2 meses seguidos abaixo de 50%', () => {
    expect(belowHalfTwoMonths(1000, { '2026-08': 400, '2026-09': 499 }, start, now)).toBe(true)
  })
  it('não sugere se um dos meses chegou a 50%', () => {
    expect(belowHalfTwoMonths(1000, { '2026-08': 400, '2026-09': 500 }, start, now)).toBe(false)
    expect(belowHalfTwoMonths(1000, { '2026-08': 900, '2026-09': 0 }, start, now)).toBe(false)
  })
  it('só conta meses inteiros com o plano ativo', () => {
    expect(belowHalfTwoMonths(1000, {}, new Date(2026, 7, 2), now)).toBe(false)
    expect(belowHalfTwoMonths(1000, {}, new Date(2026, 7, 1), now)).toBe(true)
  })
  it('meta zero nunca sugere', () => {
    expect(belowHalfTwoMonths(0, {}, start, now)).toBe(false)
  })
})
