import { createBrowserRouter } from 'react-router'
import { RequireAuth, RequireOnboarding } from '../features/auth/guards'

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const router = createBrowserRouter([
  { path: '/', lazy: page(() => import('../landing/Landing')) },
  { path: '/termos', lazy: page(() => import('../features/legal/Terms')) },
  { path: '/privacidade', lazy: page(() => import('../features/legal/Privacy')) },
  { path: '/entrar', lazy: page(() => import('../features/auth/Login')) },
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
              { path: 'ranking', lazy: page(() => import('../features/ranking/RankingPage')) },
              { path: 'config', lazy: page(() => import('../features/settings/SettingsPage')) },
              { path: 'acesso', lazy: page(() => import('../features/checkout/AccessPage')) },
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
