const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const monthYear = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

/** R$ 125.250 (sem centavos). */
export const formatBRL = (value: number) => brl.format(Math.round(value)).replace(/\s/, ' ')

/** "março de 2035" */
export const formatMonthYear = (date: Date) => monthYear.format(date)

/** "9 anos e 1 mês", "8 meses" */
export function formatDuration(months: number): string {
  const y = Math.floor(months / 12)
  const m = months % 12
  const ys = y === 1 ? '1 ano' : `${y} anos`
  const ms = m === 1 ? '1 mês' : `${m} meses`
  if (y === 0) return ms
  return m === 0 ? ys : `${ys} e ${ms}`
}
