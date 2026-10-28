import { Link, useParams } from 'react-router'
import { dayKey } from '../../lib/blocks'
import { formatBRL } from '../../lib/format'
import { useProfile } from '../../lib/queries'
import { useChallenge, type Mark } from './api'

export default function HistoryPage() {
  const { id = '' } = useParams()
  const { data: c } = useChallenge(id)
  const { data: profile } = useProfile()
  if (!c || !profile) return null

  const tz = profile.timezone
  const nameOf = new Map(c.members.map((m) => [m.user_id, m.display_name]))
  const months = groupBy(
    [...c.marks].sort((a, b) => b.marked_at.localeCompare(a.marked_at)),
    (m) => dayKey(new Date(m.marked_at), tz).slice(0, 7),
  )

  return (
    <div className="py-6">
      <Link to={`/app/d/${id}`} className="font-semibold text-forest">‹ {c.title}</Link>
      <h1 className="mt-3 text-xl font-bold">Histórico</h1>
      {months.length === 0 && <p className="mt-4 text-muted">Nenhuma marcação ainda.</p>}
      {months.map(([month, marks]) => (
        <section key={month} className="mt-8">
          <h2 className="flex items-baseline justify-between border-b-2 border-ink pb-1">
            <span className="text-lg font-bold first-letter:uppercase">{monthLabel(month)}</span>
            <span className="num font-bold">{formatBRL(sum(marks))}</span>
          </h2>
          {groupBy(marks, (m) => dayKey(new Date(m.marked_at), tz)).map(([day, dayMarks]) => (
            <div key={day} className="border-b border-line py-3">
              <p className="text-sm text-muted">{dayLabel(day)}</p>
              {groupBy(dayMarks, (m) => m.user_id).map(([user, ms]) => (
                <p key={user} className="mt-1 flex items-baseline gap-3">
                  <span className="flex-1">
                    {c.members.length > 1 && <strong>{nameOf.get(user) ?? 'Ex-participante'}: </strong>}
                    {ms.length === 1 ? 'bloco' : 'blocos'} <span className="num">{ms.map((m) => m.block).join(', ')}</span>
                  </span>
                  <span className="num font-semibold">{formatBRL(sum(ms))}</span>
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

const sum = (ms: Mark[]) => ms.reduce((t, m) => t + m.block, 0)

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>()
  for (const x of xs) {
    const k = key(x)
    map.set(k, [...(map.get(k) ?? []), x])
  }
  return [...map]
}

const monthLabel = (ym: string) =>
  new Date(`${ym}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
const dayLabel = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
