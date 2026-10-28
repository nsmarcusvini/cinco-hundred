import { NavLink, Outlet } from 'react-router'
import { MotionProvider } from '../components/MotionProvider'
import { SyncStatus } from '../components/SyncStatus'

export default function AppLayout() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-field px-3 py-2 font-semibold ${isActive ? 'bg-cream/15 text-cream' : 'text-cream/75'}`
  return (
    <>
      <header className="bg-forest text-cream">
        <nav className="mx-auto flex max-w-[760px] items-center gap-1 px-4 py-3">
          <span className="mr-auto text-lg font-extrabold">Cinco Hundred</span>
          <NavLink to="/app" end className={tab}>Início</NavLink>
          <NavLink to="/app/plano" className={tab}>Plano</NavLink>
          <NavLink to="/app/ranking" className={tab} aria-label="Ranking">🏆</NavLink>
          <NavLink to="/app/config" className={tab} aria-label="Configurações">⚙</NavLink>
        </nav>
        <SyncStatus />
      </header>
      <main className="mx-auto max-w-[760px] px-4">
        <MotionProvider>
          <Outlet />
        </MotionProvider>
      </main>
    </>
  )
}
