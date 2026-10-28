// Bottom sheet arrastável. Adaptado do "Magnetic Drawer" (21st.dev, animbits):
// sem lucide/cn, com role=dialog, Esc para fechar, altura pelo conteúdo e largura máx. de 760px.
import { AnimatePresence, animate, m, useMotionValue, type PanInfo } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
}

const spring = { type: 'spring', damping: 32, stiffness: 320 } as const

export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  const y = useMotionValue(0)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    window.addEventListener('keydown', onKey)
    // Respeita o autoFocus de um campo dentro do sheet; senão, foca o próprio painel.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus()
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const height = panel.current?.offsetHeight ?? 1
    if (info.velocity.y > 500 || info.offset.y > height * 0.35) onOpenChange(false)
    else animate(y, 0, spring)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <m.div
            className="fixed inset-0 z-40 bg-ink/50"
            onClick={() => onOpenChange(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <m.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90dvh] w-full max-w-[760px] overflow-y-auto rounded-t-[var(--radius-sheet)] bg-cream px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none"
            style={{ y, touchAction: 'none' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div className="flex justify-center py-3" aria-hidden>
              <div className="h-1.5 w-12 rounded-full bg-line" />
            </div>
            <h2 id={titleId} className="mb-4 text-lg font-bold">{title}</h2>
            {children}
          </m.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
