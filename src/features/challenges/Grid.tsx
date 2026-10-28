import { memo, type MouseEvent } from 'react'

// 140 é múltiplo de 7, 10 e 14 colunas: as linhas continuam alinhadas entre os pedaços.
const CHUNK = 140

interface GridProps {
  blocks: number[] // blocos visíveis (já filtrados)
  colorOf: Map<number, string> // bloco marcado -> cor de quem marcou
  highlight: number | null
  onSelect: (block: number) => void
}

/** Grade de até 1000 blocos: um listener só, blocos memoizados, pedaços fora da tela não são pintados. */
export function Grid({ blocks, colorOf, highlight, onSelect }: GridProps) {
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-block]')
    if (el) onSelect(Number(el.dataset.block))
  }
  const chunks: number[][] = []
  for (let i = 0; i < blocks.length; i += CHUNK) chunks.push(blocks.slice(i, i + CHUNK))

  return (
    <div onClick={onClick} className="space-y-1.5">
      {chunks.map((chunk) => (
        <div
          key={chunk[0]}
          className="grid grid-cols-7 gap-1.5 sm:grid-cols-10 md:grid-cols-14"
          style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${Math.ceil(chunk.length / 7) * 50}px` }}
        >
          {chunk.map((n) => (
            <Block key={n} n={n} color={colorOf.get(n) ?? null} highlighted={highlight === n} />
          ))}
        </div>
      ))}
    </div>
  )
}

const Block = memo(function Block({ n, color, highlighted }: { n: number; color: string | null; highlighted: boolean }) {
  return (
    <button
      type="button"
      data-block={n}
      id={`bloco-${n}`}
      aria-label={`Bloco ${n}, ${color ? 'marcado' : 'aberto'}`}
      className={`num relative aspect-square min-h-11 rounded-block text-[0.8125rem] font-bold transition-[transform,background-color] duration-200 active:scale-90 ${
        color ? 'mark-pop border-2' : 'border border-line text-muted'
      } ${highlighted ? 'z-10 scale-110 ring-4 ring-gold' : ''}`}
      style={color ? {
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 26%, var(--color-cream))`,
        color: 'var(--color-ink)',
      } : undefined}
    >
      {n}
    </button>
  )
})
