import { describe, expect, it } from 'vitest'
import { ACCENTS, contrast, movementAccent } from './accent'

const CREAM = '#f4f1e8'

describe('movementAccent', () => {
  it('dá uma cor diferente para cada movimento conhecido', () => {
    const colors = ['desafio-500', '100-mil-com-um-amigo', '100-dias'].map(movementAccent)
    expect(new Set(colors).size).toBe(3)
  })

  it('é estável para slugs novos e sempre vem da paleta', () => {
    expect(movementAccent('novo-movimento')).toBe(movementAccent('novo-movimento'))
    expect(Object.values(ACCENTS)).toContain(movementAccent('novo-movimento'))
  })

  it('toda cor tem contraste AA com o creme', () => {
    for (const c of Object.values(ACCENTS)) expect(contrast(c, CREAM)).toBeGreaterThanOrEqual(4.5)
  })
})
