// Rendimento de referência a 100% do CDI, usado na landing e no onboarding ("a mágica dos R$ 100 mil").
// Atualize as duas constantes quando o CDI mudar (o CDI acompanha a Selic over).

/** CDI anual de referência (13,65% a.a. em out/2026, Selic over). */
export const CDI_ANNUAL = 0.1365
export const CDI_REFERENCE = 'outubro de 2026'

const BUSINESS_DAYS = 252 // o CDI é diário, composto em dias úteis

export interface CdiEarnings {
  perDay: number // por dia útil
  perMonth: number
  perYear: number
}

/** Quanto `amount` rende, bruto (antes do IR), a 100% do CDI. */
export function cdiEarnings(amount: number, annual = CDI_ANNUAL): CdiEarnings {
  return {
    perDay: amount * ((1 + annual) ** (1 / BUSINESS_DAYS) - 1),
    perMonth: amount * ((1 + annual) ** (1 / 12) - 1),
    perYear: amount * annual,
  }
}

/** "13,65%" */
export const formatRate = (rate: number) =>
  `${(rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

/** R$ 50,78 (com centavos: o rendimento diário é pequeno demais para arredondar). */
export const formatCents = (value: number) =>
  'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
