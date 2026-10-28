import { describe, expect, it } from 'vitest'
import { brl, effectivePayday, inWindow, isPaydayToday, localTime } from './schedule'

describe('localTime', () => {
  it('converte para o fuso do usuário', () => {
    const t = localTime(new Date('2026-11-05T12:07:00Z'), 'America/Sao_Paulo')
    expect(t).toMatchObject({ year: 2026, month: 11, day: 5, dow: 4, minutes: 9 * 60 + 7, dateKey: '2026-11-05' })
  })
  it('meia-noite em SP ainda é o dia anterior em UTC', () => {
    expect(localTime(new Date('2026-11-06T02:30:00Z'), 'America/Sao_Paulo').dateKey).toBe('2026-11-05')
  })
})

describe('inWindow', () => {
  it('janela de 15 minutos', () => {
    expect(inWindow('20:00', 20 * 60 + 3)).toBe(true)
    expect(inWindow('20:14', 20 * 60)).toBe(true)
    expect(inWindow('20:15', 20 * 60 + 2)).toBe(false)
    expect(inWindow('19:59', 20 * 60)).toBe(false)
  })
})

describe('effectivePayday', () => {
  it('dia útil fica igual', () => {
    expect(effectivePayday(2026, 11, 5)).toEqual({ month: 11, day: 5 }) // quinta
  })
  it('sábado e domingo vão para segunda', () => {
    expect(effectivePayday(2026, 11, 7)).toEqual({ month: 11, day: 9 }) // sábado
    expect(effectivePayday(2026, 11, 8)).toEqual({ month: 11, day: 9 }) // domingo
  })
  it('dia 31 em mês de 30 dias vira o último dia', () => {
    expect(effectivePayday(2026, 9, 31)).toEqual({ month: 9, day: 30 }) // quarta
  })
  it('fim de semana no fim do mês empurra para o mês seguinte', () => {
    expect(effectivePayday(2026, 10, 31)).toEqual({ month: 11, day: 2 }) // sábado 31/10 -> segunda 2/11
  })
})

describe('isPaydayToday', () => {
  const at = (iso: string) => localTime(new Date(iso), 'America/Sao_Paulo')
  it('aviso no dia certo e não no dia original de fim de semana', () => {
    expect(isPaydayToday(at('2026-11-09T12:00:00Z'), [7])).toBe(true)
    expect(isPaydayToday(at('2026-11-07T12:00:00Z'), [7])).toBe(false)
  })
  it('pagamento de outubro empurrado para 2/11', () => {
    expect(isPaydayToday(at('2026-11-02T12:00:00Z'), [31])).toBe(true)
  })
  it('duas datas (adiantamento)', () => {
    expect(isPaydayToday(at('2026-11-05T12:00:00Z'), [5, 20])).toBe(true)
    expect(isPaydayToday(at('2026-11-20T12:00:00Z'), [5, 20])).toBe(true)
    expect(isPaydayToday(at('2026-11-06T12:00:00Z'), [5, 20])).toBe(false)
  })
})

describe('brl', () => {
  it('formata sem centavos', () => {
    expect(brl(1250)).toBe('R$ 1.250')
  })
})
