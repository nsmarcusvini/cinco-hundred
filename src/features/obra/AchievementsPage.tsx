import { LEVELS } from '../../lib/obra'
import { BrickWall } from './ObraCard'
import { useProgress } from './progress'

/** /app/conquistas — a obra por inteiro (todos os níveis) e os selos, ganhos e por ganhar. */
export default function AchievementsPage() {
  const p = useProgress()
  if (!p) return <div className="mt-6 h-64 rounded-field bg-line/50" aria-hidden />
  const won = p.list.filter((a) => a.unlocked).length

  return (
    <div className="space-y-10 py-6">
      <header className="flex items-center gap-5">
        <BrickWall progress={p.obra.progress} className="w-28 shrink-0" />
        <div>
          <h1 className="text-sm text-muted">Sua obra</h1>
          <p className="text-3xl leading-tight font-extrabold">{p.obra.level.name}</p>
          <p className="mt-1">
            <span className="num font-bold">{p.bricks}</span> {p.bricks === 1 ? 'tijolo' : 'tijolos'}: cada bloco que você marca é um tijolo.
          </p>
        </div>
      </header>

      <section aria-labelledby="niveis">
        <h2 id="niveis" className="mb-3 text-lg font-bold">Níveis</h2>
        <ol className="divide-y divide-line">
          {LEVELS.map((l, i) => {
            const state = i < p.obra.index ? 'feito' : i === p.obra.index ? 'atual' : 'futuro'
            return (
              <li key={l.name} className={`flex items-center gap-3 py-2.5 ${state === 'futuro' ? 'text-muted' : ''}`}>
                <span className={`size-4 shrink-0 rounded-[3px] ${state === 'futuro' ? 'border-2 border-line' : state === 'atual' ? 'bg-gold' : 'bg-leaf'}`} aria-hidden />
                <span className={`flex-1 ${state === 'atual' ? 'font-bold' : ''}`}>{l.name}{state === 'atual' && ' (você está aqui)'}</span>
                <span className="num text-sm">{l.from === 0 ? 'início' : `${l.from} tijolos`}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <section aria-labelledby="selos">
        <h2 id="selos" className="mb-1 text-lg font-bold">Conquistas</h2>
        <p className="mb-4 text-muted"><span className="num">{won} de {p.list.length}</span>. Contam o hábito, não o valor guardado.</p>
        <ul className="grid grid-cols-2 gap-2">
          {p.list.map((a) => (
            <li key={a.id} className={`rounded-field border-2 p-3 ${a.unlocked ? 'border-forest bg-forest text-cream' : 'border-dashed border-line text-muted'}`}>
              <p className="font-bold">{a.unlocked ? '★ ' : ''}{a.title}</p>
              <p className={`mt-1 text-sm ${a.unlocked ? 'text-cream/85' : ''}`}>{a.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
