import { animate } from 'motion/react'
import { useEffect, useRef } from 'react'
import { formatBRL } from '../lib/format'

// Arquivo próprio para que telas sem valores animados (login, convite...) não carreguem o Motion.

/** Valor em R$ que "rola" até o novo total. */
export function AnimatedBRL({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef(value)
  useEffect(() => {
    const from = last.current
    last.current = value
    const controls = animate(from, value, {
      duration: 0.5,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = formatBRL(v)
      },
    })
    return () => controls.stop()
  }, [value])
  return <span ref={ref} className={`num ${className ?? ''}`}>{formatBRL(value)}</span>
}
