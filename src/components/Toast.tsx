import { useSyncExternalStore } from 'react'

// Sem Motion de propósito: o Toaster fica na raiz do app e entra no JS inicial. A entrada é uma animação CSS.

type Toast = { id: number; text: string; tone: 'info' | 'error' }

let toasts: Toast[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, tone: Toast['tone'] = 'info') {
  const id = Date.now() + Math.random()
  toasts = [...toasts, { id, text, tone }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 4000)
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => toasts,
  )
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-[760px] flex-col gap-2 p-4" aria-live="polite">
      {list.map((t) => (
        <div key={t.id}
          className={`toast-in rounded-field px-4 py-3 font-medium ${t.tone === 'error' ? 'bg-danger text-white' : 'bg-forest text-cream'}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
