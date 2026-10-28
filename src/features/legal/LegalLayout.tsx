import type { ReactNode } from 'react'
import { Link } from 'react-router'

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[680px] px-4 py-10">
      <Link to="/" className="text-lg font-extrabold text-forest">Cinco Hundred</Link>
      <h1 className="mt-8 text-2xl font-extrabold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Atualizado em {updated}</p>
      <div className="mt-8 space-y-6 leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </main>
  )
}
