import { useId, type ReactNode } from 'react'
import { HOUSE_STAGES, houseFor, type House } from '../../lib/house'

// Paleta da ilustração: tokens da marca + neutros de obra (concreto, madeira, vidro, água).
const C = {
  sky: '#eaf3ef',
  earth: '#d9ccb0',
  grass: '#a8d49a',
  concrete: '#a3a8a2',
  rebar: '#7b5b45',
  wall: '#f3eee1',
  wallLine: '#cdbf9f',
  wood: '#8a5a3b',
  woodDark: '#6f4630',
  glass: '#bcd7df',
  lit: '#f6d98b',
  water: '#6bbad8',
  deck: '#e7dcc3',
  stone: '#d2c7ae',
  steel: '#5c6a64',
  forest: '#0b3d2e',
  gold: '#e8b44c',
  leaf: '#12a150',
  leafDark: '#0f8a44',
  muted: '#56635b',
}

// Etapas (índices de HOUSE_STAGES).
const FUNDACAO = 1
const ESTRUTURA = 2
const PAREDES = 3
const TELHADO = 4
const FACHADA = 5
const GARAGEM = 6
const PAISAGISMO = 7
const PISCINA = 8

const GROUND = 158

/** Só desenha a peça a partir de `stage` (e de `at` do caminho dentro dela). Peças novas entram com fade sutil. */
function Piece({ h, stage, at = 0, children }: { h: House; stage: number; at?: number; children: ReactNode }) {
  if (h.stage < stage || (h.stage === stage && h.within < at)) return null
  return <g className="house-in">{children}</g>
}

/** Quanto de uma peça que "cresce" já foi feito: 0 antes da etapa, cresce dentro dela, 1 depois. */
const grow = (h: House, stage: number, min = 0.15) =>
  h.stage < stage ? 0 : h.stage === stage ? min + (1 - min) * h.within : 1

/** Ilustração em camadas: cada etapa acrescenta peças sobre as anteriores. Usada no app e na landing. */
export function HouseArt({ h, className = '' }: { h: House; className?: string }) {
  const uid = useId()
  const titleId = `${uid}t`
  const clipId = `${uid}c`
  const lit = h.state === 'complete'
  const slab = grow(h, FUNDACAO, 0.3)
  const pillars = grow(h, ESTRUTURA, 0.25)
  const walls = grow(h, PAREDES)
  const glass = lit ? C.lit : C.glass

  return (
    <svg viewBox="0 0 320 190" className={className} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{h.alt}</title>
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y={GROUND - 92 * walls} width="320" height={92 * walls} />
        </clipPath>
      </defs>

      <rect width="320" height={GROUND} fill={C.sky} />

      {/* Conquista: sol e brilhos atrás da casa pronta */}
      {lit && (
        <g className="house-in">
          <circle cx="262" cy="40" r="22" fill={C.gold} opacity="0.35" />
          <circle cx="262" cy="40" r="13" fill={C.gold} opacity="0.7" />
          {[[34, 36], [118, 28], [214, 70], [300, 92]].map(([x, y], i) => (
            <path key={i} className="house-twinkle" style={{ animationDelay: `${i * 0.6}s` }}
              d={`M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6} Z`}
              fill={C.gold} />
          ))}
        </g>
      )}

      {/* Terreno (vira gramado no paisagismo) */}
      <rect x="0" y={GROUND} width="320" height={190 - GROUND} fill={h.stage >= PAISAGISMO ? C.grass : C.earth} />

      {/* Planta marcada no chão enquanto não há paredes */}
      {h.stage < PAREDES && (
        <g fill="none" stroke={C.muted} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7">
          <rect x="60" y="66" width="130" height="92" />
          <rect x="190" y="106" width="80" height="52" />
          {[56, 190, 274].map((x) => <rect key={x} x={x} y={GROUND - 6} width="3" height="8" fill={C.wood} stroke="none" />)}
        </g>
      )}

      {/* Fundação: laje concretada da esquerda para a direita e ferragens */}
      <Piece h={h} stage={FUNDACAO}>
        <rect x="52" y={GROUND - 4} width={226 * slab} height="8" rx="1" fill={C.concrete} />
      </Piece>
      {h.stage === FUNDACAO && (
        <g stroke={C.rebar} strokeWidth="2">
          {[62, 96, 124, 156, 186, 220, 266].filter((_, i) => i / 7 <= h.within + 0.15).map((x) => (
            <line key={x} className="house-in" x1={x} y1={GROUND - 4} x2={x} y2={GROUND - 34} />
          ))}
        </g>
      )}

      {/* Paredes subindo (atrás dos pilares) */}
      <Piece h={h} stage={PAREDES}>
        <g clipPath={`url(#${clipId})`}>
          <rect x="60" y="66" width="130" height={GROUND - 4 - 66} fill={C.wall} stroke={C.wallLine} />
          <rect x="190" y="106" width="80" height={GROUND - 4 - 106} fill={C.wall} stroke={C.wallLine} />
        </g>
      </Piece>

      {/* Estrutura: pilares subindo e laje entre os andares */}
      <Piece h={h} stage={ESTRUTURA}>
        {[60, 123, 186, 266].map((x) => {
          const top = x > 190 ? 106 : 66
          const full = GROUND - 4 - top
          return <rect key={x} x={x} y={GROUND - 4 - full * pillars} width="4" height={full * pillars} fill={C.concrete} />
        })}
      </Piece>
      <Piece h={h} stage={ESTRUTURA} at={0.5}>
        <rect x="58" y="110" width="134" height="4" fill={C.concrete} />
      </Piece>

      {/* Telhado: lajes de cobertura, depois janelas de vidro e porta */}
      <Piece h={h} stage={TELHADO}>
        <rect x="48" y="58" width="154" height="9" rx="1" fill={C.forest} />
        <rect x="184" y="99" width="94" height="7" rx="1" fill={C.forest} />
      </Piece>
      <Piece h={h} stage={TELHADO} at={0.4}>
        <rect x="70" y="76" width="58" height="26" fill={glass} stroke={C.forest} strokeWidth="2" />
        <line x1="99" y1="76" x2="99" y2="102" stroke={C.forest} strokeWidth="1.5" />
        <rect x="70" y="118" width="62" height={GROUND - 4 - 118} fill={glass} stroke={C.forest} strokeWidth="2" />
        <line x1="101" y1="118" x2="101" y2={GROUND - 4} stroke={C.forest} strokeWidth="1.5" />
      </Piece>
      <Piece h={h} stage={TELHADO} at={0.75}>
        <rect x="144" y="120" width="26" height={GROUND - 4 - 120} fill={C.wood} stroke={C.forest} strokeWidth="2" />
        <circle cx="165" cy="138" r="1.6" fill={C.gold} />
        <rect x="140" y="116" width="34" height="3" fill={C.forest} />
      </Piece>

      {/* Fachada: ripado de madeira, janela alta, guarda-corpo de vidro e luminárias */}
      <Piece h={h} stage={FACHADA}>
        <rect x="134" y="70" width="52" height="38" fill={C.wood} />
        {[140, 147, 154, 161, 168, 175, 182].map((x) => (
          <line key={x} x1={x} y1="70" x2={x} y2="108" stroke={C.woodDark} strokeWidth="1.5" />
        ))}
        <rect x="146" y="80" width="30" height="20" fill={glass} stroke={C.forest} strokeWidth="2" />
      </Piece>
      <Piece h={h} stage={FACHADA} at={0.5}>
        <rect x="190" y="88" width="84" height="11" fill={C.glass} opacity="0.55" stroke={C.forest} strokeWidth="1" />
        {[136, 178].map((x) => (
          <g key={x}>
            <rect x={x} y="126" width="2" height="12" fill={C.forest} />
            <circle cx={x + 1} cy="125" r="2.6" fill={lit ? C.gold : C.lit} />
          </g>
        ))}
      </Piece>

      {/* Garagem e entrada de carro */}
      <Piece h={h} stage={GARAGEM}>
        <rect x="200" y="118" width="60" height={GROUND - 4 - 118} fill={C.steel} />
        {[126, 134, 142].map((y) => <line key={y} x1="200" y1={y} x2="260" y2={y} stroke="#47534e" strokeWidth="1.5" />)}
      </Piece>
      <Piece h={h} stage={GARAGEM} at={0.5}>
        <path d="M200 158 L260 158 L276 190 L188 190 Z" fill={C.stone} />
      </Piece>

      {/* Paisagismo: árvores, arbustos e caminho até a porta */}
      <Piece h={h} stage={PAISAGISMO}>
        <rect x="18" y="128" width="5" height="30" fill={C.wood} />
        <circle cx="20" cy="122" r="16" fill={C.leaf} />
        <circle cx="28" cy="130" r="10" fill={C.leafDark} />
      </Piece>
      <Piece h={h} stage={PAISAGISMO} at={0.4}>
        <rect x="300" y="132" width="4" height="26" fill={C.wood} />
        <circle cx="302" cy="126" r="12" fill={C.leaf} />
        {[44, 54, 284].map((x) => <circle key={x} cx={x} cy={GROUND} r="6" fill={C.leafDark} />)}
      </Piece>
      <Piece h={h} stage={PAISAGISMO} at={0.7}>
        <path d="M151 160 L163 160 L168 190 L146 190 Z" fill={C.stone} />
      </Piece>

      {/* Piscina com deck */}
      <Piece h={h} stage={PISCINA}>
        <rect x="56" y="164" width="88" height="22" rx="2" fill={C.deck} />
      </Piece>
      <Piece h={h} stage={PISCINA} at={0.4}>
        <rect x="62" y="168" width="76" height="14" rx="2" fill={C.water} />
        <path d="M68 175 q6 -3 12 0 t12 0 t12 0 t12 0 t12 0" fill="none" stroke="#e8f5fb" strokeWidth="1.5" />
      </Piece>
    </svg>
  )
}

/** Etapas da obra como trilha de quadradinhos (a primeira é o terreno, que não conta). */
export function HouseSteps({ h }: { h: House }) {
  const steps = HOUSE_STAGES.slice(1)
  return (
    <ol className="flex gap-1" aria-label={`Etapa ${h.stage} de ${steps.length}`}>
      {steps.map((s, i) => (
        <li key={s.name} className={`size-3 rounded-[3px] ${h.stage > i ? 'bg-leaf' : 'bg-line'}`}>
          <span className="sr-only">{s.name}{h.stage > i ? ', feita' : ''}</span>
        </li>
      ))}
    </ol>
  )
}

export function HouseProgress({ pct, group }: { pct: number; group: boolean }) {
  const h = houseFor(pct)
  return (
    <section aria-labelledby="casa" className="mt-6 rounded-field border-2 border-line p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="casa" className="text-sm text-muted">{group ? 'A casa do grupo' : 'A casa do desafio'}</h2>
        <HouseSteps h={h} />
      </div>
      <HouseArt h={h} className="mx-auto mt-2 block h-auto w-full max-w-[420px] rounded-[6px]" />
      <p className="mt-2 text-lg leading-tight font-extrabold" aria-live="polite">
        {h.state === 'complete' ? 'Casa pronta. Obra entregue!' : h.name}
      </p>
      <p className="mt-1 text-sm text-muted">
        {h.state === 'empty'
          ? group
            ? 'Cada bloco que alguém do grupo marcar vira tijolo desta casa. O primeiro começa a fundação.'
            : 'Cada bloco que você marcar vira tijolo desta casa. O primeiro começa a fundação.'
          : h.state === 'complete'
            ? 'Todos os blocos marcados viraram tijolo. A casa está de pé, do alicerce à piscina.'
            : <>Cada bloco marcado {group ? 'por qualquer pessoa do grupo ' : ''}sobe a obra. Próxima etapa em{' '}
              <span className="num font-bold">{h.next?.from.toLocaleString('pt-BR')}%</span>: {h.next?.name.toLowerCase()}.</>}
      </p>
    </section>
  )
}
