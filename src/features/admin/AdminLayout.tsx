import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { MotionProvider } from '../../components/MotionProvider'

export default function AdminLayout() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-field px-3 py-2 font-semibold ${isActive ? 'bg-cream/15 text-cream' : 'text-cream/75'}`
  return (
    <>
      <title>Painel | Tijoblock</title>
      <meta name="robots" content="noindex, nofollow" />
      <header className="bg-forest text-cream">
        <nav className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-1 px-4 py-3" aria-label="Painel">
          <span className="mr-auto text-lg font-extrabold">Tijoblock, painel</span>
          <NavLink to="/admin" end className={tab}>Visão geral</NavLink>
          <NavLink to="/admin/usuarios" className={tab}>Usuários</NavLink>
          <NavLink to="/admin/uso" className={tab}>Uso</NavLink>
          <NavLink to="/admin/funil" className={tab}>Funil</NavLink>
          <NavLink to="/app" className="px-3 py-2 text-cream/75 underline-offset-4 hover:underline">Voltar ao app</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-[1080px] px-4 pt-6 pb-16">
        <MotionProvider>
          <Suspense fallback={<p className="py-10 text-muted">Carregando…</p>}>
            <Outlet />
          </Suspense>
        </MotionProvider>
      </main>
    </>
  )
}
