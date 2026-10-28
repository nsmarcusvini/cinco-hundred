// Regras de agenda das notificações (puras, testadas com Vitest).

export interface LocalTime {
  year: number
  month: number // 1-12
  day: number
  dow: number // 0 = domingo
  minutes: number // minutos desde 00:00
  dateKey: string // AAAA-MM-DD
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function localTime(now: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  )
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day)
  return {
    year, month, day,
    dow: DOW[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

/** O horário "HH:MM" cai na janela de 15 min que começa em `minutes`? */
export function inWindow(hhmm: string | number, minutes: number, size = 15): boolean {
  const target = typeof hhmm === 'number' ? hhmm : Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  const start = minutes - (minutes % size)
  return target >= start && target < start + size
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/**
 * Dia em que o aviso de salário sai, no mês: o dia do pagamento (limitado ao último dia do mês)
 * e, se cair no fim de semana, o próximo dia útil.
 */
export function effectivePayday(year: number, month: number, payday: number): { month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, Math.min(payday, daysIn(year, month))))
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2)
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1)
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** Hoje é dia de aviso de salário? Considera o pagamento do mês atual e o do mês anterior empurrado para cá. */
export function isPaydayToday(t: LocalTime, paydays: number[]): boolean {
  const prev = t.month === 1 ? { y: t.year - 1, m: 12 } : { y: t.year, m: t.month - 1 }
  return paydays.some((p) => {
    const cur = effectivePayday(t.year, t.month, p)
    const last = effectivePayday(prev.y, prev.m, p)
    return (cur.month === t.month && cur.day === t.day) || (last.month === t.month && last.day === t.day)
  })
}

/** Dias seguidos com marcação (mesma regra de src/lib/blocks.ts): se hoje não marcou, conta a partir de ontem. */
export function streak(markedAt: string[], timeZone: string, now: Date): number {
  const key = (d: Date) => localTime(d, timeZone).dateKey
  const days = new Set(markedAt.map((m) => key(new Date(m))))
  const cursor = new Date(now)
  if (!days.has(key(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1)
  let count = 0
  while (days.has(key(cursor))) {
    count++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return count
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const monthName = (m: number) => MONTHS[m - 1]

export const brl = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
