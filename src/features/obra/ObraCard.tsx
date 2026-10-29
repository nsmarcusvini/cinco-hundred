import { Link } from 'react-router'
import type { Obra } from '../../lib/obra'

const ROWS = 6
const PER_ROW = 5

/** Parede de tijolos em amarração (fileiras desencontradas). Enche de baixo para cima com o progresso do nível. */
export function BrickWall({ progress, className = '' }: { progress: number; className?: string }) {
  const total = ROWS * PER_ROW
  const filled = Math.round(progress * total)
  const w = 20
  const h = 9
  const gap = 2
  const bricks: { x: number; y: number; on: boolean }[] = []
  let n = 0
  for (let r = 0; r < ROWS; r++) {
    const offset = r % 2 ? -(w + gap) / 2 : 0 // fileira de cima desencontrada da de baixo
    const y = (ROWS - 1 - r) * (h + gap)
    for (let i = 0; i < PER_ROW; i++) bricks.push({ x: offset + i * (w + gap), y, on: n++ < filled })
  }
  const width = PER_ROW * (w + gap) - gap
  return (
    <svg viewBox={`0 0 ${width} ${ROWS * (h + gap) - gap}`} className={className} aria-hidden>
      <defs>
        <clipPath id="wall"><rect width={width} height={ROWS * (h + gap)} /></clipPath>
      </defs>
      <g clipPath="url(#wall)">
        {bricks.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={w} height={h} rx={1.5}
            className={b.on ? 'fill-leaf' : 'fill-line'} />
        ))}
        {/* meio-tijolo que completa a ponta das fileiras desencontradas */}
        {Array.from({ length: ROWS }, (_, r) => r % 2 === 1 && (
          <rect key={`e${r}`} x={width - (w - gap) / 2} y={(ROWS - 1 - r) * (h + gap)} width={w} height={h} rx={1.5}
            className={bricks[r * PER_ROW + PER_ROW - 1].on ? 'fill-leaf' : 'fill-line'} />
        ))}
      </g>
    </svg>
  )
}

/** Card "Sua obra" da Início: nível, parede do nível atual e atalho para as conquistas. */
export function ObraCard({ obra, bricks, unlocked, total }: { obra: Obra; bricks: number; unlocked: number; total: number }) {
  return (
    <section data-tour="obra" aria-labelledby="obra" className="rounded-field border-2 border-line p-4">
      <div className="flex items-center gap-4">
        <BrickWall progress={obra.progress} className="w-24 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="obra" className="text-sm text-muted">Sua obra</h2>
          <p className="text-2xl leading-tight font-extrabold">{obra.level.name}</p>
          <p className="mt-1 text-sm">
            <span className="num font-bold">{bricks}</span> {bricks === 1 ? 'tijolo' : 'tijolos'}.{' '}
            {obra.next ? <>Faltam <span className="num font-bold">{obra.toNext}</span> para {obra.next.name}.</> : 'Sua obra chegou ao topo.'}
          </p>
        </div>
      </div>
      <Link to="/app/conquistas" className="mt-3 flex min-h-11 items-center justify-between rounded-field bg-line/40 px-3 font-semibold text-forest">
        <span>Conquistas <span className="num">{unlocked} de {total}</span></span>
        <span aria-hidden>›</span>
      </Link>
    </section>
  )
}
