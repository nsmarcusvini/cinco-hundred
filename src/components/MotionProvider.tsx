import { LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

// Fica nas telas lazy que animam (/app e onboarding), não na raiz: assim o Motion sai do JS inicial.
// domMax (inclui arrastar) carrega à parte.
const features = () => import('../lib/motion-features').then((m) => m.default)

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
