import { describe, expect, it } from 'vitest'
import { HOUSE_DONE, HOUSE_STAGES, houseFor } from './house'

describe('houseFor', () => {
  it('sem progresso: terreno', () => {
    const h = houseFor(0)
    expect(h.stage).toBe(0)
    expect(h.state).toBe('empty')
    expect(h.next?.name).toBe('Fundação')
  })
  it('qualquer bloco já começa a fundação', () => {
    expect(houseFor(0.01).stage).toBe(1)
    expect(houseFor(0.01).state).toBe('partial')
  })
  it('passa por todas as etapas, na ordem da obra', () => {
    const names = [0, 5, 15, 30, 40, 55, 70, 80, 90, 100].map((p) => houseFor(p).name)
    expect(names).toEqual(HOUSE_STAGES.map((s) => s.name))
  })
  it('troca de etapa nos marcos 25, 50 e 75', () => {
    expect(houseFor(24.99).name).toBe('Estrutura')
    expect(houseFor(25).name).toBe('Paredes')
    expect(houseFor(49.9).name).toBe('Telhado e janelas')
    expect(houseFor(50).name).toBe('Fachada')
    expect(houseFor(75).name).toBe('Paisagismo')
    expect(houseFor(99.99).name).toBe('Piscina')
  })
  it('progresso dentro da etapa', () => {
    expect(houseFor(31.25).within).toBeCloseTo(0.5)
    expect(houseFor(55).within).toBeCloseTo(0.4)
  })
  it('concluída só em 100%', () => {
    const h = houseFor(100)
    expect(h.stage).toBe(HOUSE_DONE)
    expect(h.state).toBe('complete')
    expect(h.next).toBeNull()
    expect(houseFor(130).stage).toBe(HOUSE_DONE)
  })
  it('valor inválido vira terreno', () => {
    expect(houseFor(Number.NaN).stage).toBe(0)
    expect(houseFor(-5).stage).toBe(0)
  })
})
