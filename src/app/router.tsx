import { createBrowserRouter } from 'react-router'
import { RequireAdmin, RequireAuth, RequireOnboarding } from '../features/auth/guards'
import { track } from '../lib/analytics'
import { genericRoute, isAutomated } from '../lib/events'

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const router = createBrowserRouter([
  { path: '/', lazy: page(() => import('../landing/Landing')) },
  { path: '/termos', lazy: page(() => import('../features/legal/Terms')) },
  { path: '/privacidade', lazy: page(() => import('../features/legal/Privacy')) },
  { path: '/entrar', lazy: page(() => import('../features/auth/Login')) },
  { path: '/cadastro', lazy: page(() => import('../features/auth/Signup')) },
  { path: '/redefinir-senha', lazy: page(() => import('../features/auth/ResetPassword')) },
  { path: '/convite/:code', lazy: page(() => import('../features/challenges/InvitePage')) },
  { path: '/m/:slug', lazy: page(() => import('../features/movements/MovementPage')) },
  {
    Component: RequireAuth,
    children: [
      { path: '/onboarding', lazy: page(() => import('../features/onboarding/Onboarding')) },
      // Volta do Checkout: pode acontecer no meio do onboarding, então fica fora do RequireOnboarding.
      { path: '/app/bem-vindo', lazy: page(() => import('../features/checkout/WelcomePage')) },
      {
        Component: RequireOnboarding,
        children: [
          {
            path: '/app',
            lazy: page(() => import('./AppLayout')),
            children: [
              { index: true, lazy: page(() => import('./Home')) },
              { path: 'plano', lazy: page(() => import('../features/plan/PlanPage')) },
              { path: 'novo', lazy: page(() => import('../features/challenges/NewChallenge')) },
              { path: 'd/:id', lazy: page(() => import('../features/challenges/ChallengePage')) },
              { path: 'd/:id/historico', lazy: page(() => import('../features/challenges/HistoryPage')) },
              { path: 'conquistas', lazy: page(() => import('../features/obra/AchievementsPage')) },
              { path: 'ranking', lazy: page(() => import('../features/ranking/RankingPage')) },
              { path: 'config', lazy: page(() => import('../features/settings/SettingsPage')) },
              { path: 'acesso', lazy: page(() => import('../features/checkout/AccessPage')) },
            ],
          },
        ],
      },
      // Fora do RequireOnboarding: a conta admin não precisa ter passado pelo onboarding.
      { path: '/admin/verificacao', lazy: page(() => import('../features/admin/AdminMfa')) },
      {
        Component: RequireAdmin,
        children: [
          {
            path: '/admin',
            lazy: page(() => import('../features/admin/AdminLayout')),
            children: [
              { index: true, lazy: page(() => import('../features/admin/AdminOverview')) },
              { path: 'usuarios', lazy: page(() => import('../features/admin/AdminUsers')) },
              { path: 'usuarios/:id', lazy: page(() => import('../features/admin/AdminUserDetail')) },
              { path: 'uso', lazy: page(() => import('../features/admin/AdminUsage')) },
              { path: 'funil', lazy: page(() => import('../features/admin/AdminFunnel')) },
            ],
          },
        ],
      },
    ],
  },
])

/** Resolve quando a tela da rota aberta já carregou. Montar antes disso trocaria o HTML pré-renderizado por uma tela vazia. */
export const routerReady = new Promise<void>((resolve) => {
  if (router.state.initialized) return resolve()
  const stop = router.subscribe((s) => {
    if (s.initialized) {
      stop()
      resolve()
    }
  })
})

/** Uma page_view por tela aberta, só com a rota genérica. O painel não conta, e em dev nada é enviado. */
function countPageViews() {
  let last = ''
  const count = () => {
    const route = genericRoute(router.state.location.pathname)
    if (route === last) return
    last = route
    if (!route.startsWith('/admin')) track('page_view', { route })
  }
  count()
  router.subscribe((s) => {
    if (s.navigation.state === 'idle') count()
  })
}

if (import.meta.env.PROD && !isAutomated()) void routerReady.then(countPageViews)
