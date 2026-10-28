import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useUserId } from '../features/auth/AuthProvider'
import type { Profile } from '../lib/queries'
import { supabase } from '../lib/supabase'

export interface TourStep {
  target: string // valor do atributo data-tour do elemento destacado
  title: string
  body: ReactNode
}

const PAD = 6 // folga do recorte em volta do elemento
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Tutorial com destaques na tela real: escurece a página, recorta o elemento do passo e mostra um balão.
 * Passos cujo elemento não está na tela (ex.: sem movimentos) são pulados.
 */
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  // Procura os elementos depois do primeiro desenho: os que entram na tela junto com o tutorial já existem.
  const [available, setAvailable] = useState<TourStep[] | null>(null)
  useEffect(() => setAvailable(steps.filter((s) => find(s.target))), []) // só na abertura
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [popH, setPopH] = useState(0)
  const pop = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const step = available?.[i]

  // Altura real do balão (o texto muda a cada passo) para decidir se ele cabe abaixo ou acima do destaque.
  useEffect(() => {
    if (!pop.current) return
    const ro = new ResizeObserver(([e]) => setPopH(e.target.getBoundingClientRect().height))
    ro.observe(pop.current)
    return () => ro.disconnect()
  }, [rect !== null])

  // Leva o elemento para o meio da tela e acompanha a posição dele (rolagem, teclado do celular, giro).
  useEffect(() => {
    if (!step) return
    const el = find(step.target)!
    // Perto do topo (abaixo do cabeçalho), para sobrar espaço para o balão embaixo.
    el.style.scrollMarginTop = '96px'
    el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' })
    let frame = 0
    let last = ''
    const track = () => {
      const r = el.getBoundingClientRect()
      const key = `${r.top}|${r.left}|${r.width}|${r.height}`
      if (key !== last) {
        last = key
        setRect(r)
      }
      frame = requestAnimationFrame(track)
    }
    track()
    primary.current?.focus({ preventScroll: true })
    return () => cancelAnimationFrame(frame)
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (available?.length === 0) onClose()
  }, [available, onClose])

  if (!available || !step || !rect) return null
  const last = i === available.length - 1
  const gap = PAD + 12
  const fitsBelow = innerHeight - rect.bottom - gap - 16 >= popH
  const fitsAbove = rect.top - gap - 16 >= popH
  // Sem espaço dos dois lados (elemento grande, tela baixa): o balão fica preso embaixo, por cima da página.
  const place = fitsBelow ? { top: rect.bottom + gap } : fitsAbove ? { bottom: innerHeight - rect.top + gap } : { bottom: 16 }
  const motion = reduced() ? '' : 'transition-all duration-300 ease-out'

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Bloqueia toques na página enquanto o tutorial está aberto. */}
      <div className="absolute inset-0" aria-hidden />
      <div
        aria-hidden
        className={`pointer-events-none fixed rounded-field ${motion}`}
        style={{
          top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          boxShadow: '0 0 0 3px #e8b44c, 0 0 0 9999px rgb(11 61 46 / 0.78)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        ref={pop}
        className={`fixed inset-x-4 mx-auto max-h-[calc(100dvh-2rem)] max-w-[420px] overflow-y-auto rounded-field bg-cream p-5 text-ink shadow-[0_12px_40px_rgb(11_61_46/0.35)] ${motion}`}
        style={place}
      >
        <div className="flex items-center gap-3">
          <ol className="flex flex-1 gap-1" aria-label={`Passo ${i + 1} de ${available.length}`}>
            {available.map((s, n) => (
              <li key={s.target + n} className={`h-1.5 flex-1 rounded-[2px] ${n <= i ? 'bg-leaf' : 'bg-line'}`} />
            ))}
          </ol>
          <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm font-semibold text-muted">Pular</button>
        </div>
        <h2 id="tour-title" className="mt-2 text-lg font-bold">{step.title}</h2>
        <div className="mt-1 leading-relaxed">{step.body}</div>
        <div className="mt-4 flex gap-2">
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)}
              className="min-h-12 rounded-field border-2 border-forest px-4 font-semibold text-forest">Anterior</button>
          )}
          <button ref={primary} type="button" onClick={() => (last ? onClose() : setI(i + 1))}
            className="min-h-12 flex-1 rounded-field bg-forest px-4 font-semibold text-cream">
            {last ? 'Começar' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  )
}

const find = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`)

/** Marca o tutorial como visto (na hora, na tela; e no perfil, para não voltar em outro aparelho). */
export function useFinishTour() {
  const uid = useUserId()
  const qc = useQueryClient()
  return () => {
    const done = new Date().toISOString()
    qc.setQueryData<Profile>(['profile', uid], (p) => p && { ...p, tour_done_at: done })
    // .then(): a consulta do Supabase só é enviada quando alguém espera o resultado.
    void supabase.from('profiles').update({ tour_done_at: done }).eq('id', uid).then()
  }
}
