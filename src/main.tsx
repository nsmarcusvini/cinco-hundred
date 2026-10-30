import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { captureInstallPrompt } from './lib/install'
import { captureUtm } from './lib/utm'
import './index.css'

captureUtm()
captureInstallPrompt()
// Fora do caminho crítico: só depois do load. CLS guardado como milésimos (0,05 = 50).
if (import.meta.env.PROD) addEventListener('load', () => void import('./lib/vitals').then((m) => m.reportVitals()), { once: true })
// O navegador só procura versão nova do SW ao navegar, e o PWA instalado volta do segundo plano sem navegar:
// confere também ao voltar para a tela e a cada 30 min. Achando, o SW novo assume e a página recarrega.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => {
      if (navigator.onLine && !reg.installing) void reg.update()
    }
    setInterval(check, 30 * 60_000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
})

// Deploy novo apaga os arquivos antigos: uma tela que ainda não tinha carregado falharia. Recarrega para pegar a versão
// nova (no máximo uma vez por minuto, para não entrar em loop se o problema for outro).
addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('ch.preload-reload') ?? 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem('ch.preload-reload', String(Date.now()))
  } catch {
    /* sem storage: recarrega mesmo assim */
  }
  e.preventDefault()
  location.reload()
})

// Duas portas de entrada: a landing (/) não carrega o app (supabase-js, router, query...) e vice-versa.
const root = createRoot(document.getElementById('root')!)
if (location.pathname === '/') {
  void import('./landing/Landing').then(({ default: Landing }) => root.render(<Landing />))
} else {
  void import('./app/App').then(async ({ default: App, routerReady }) => {
    await routerReady
    root.render(<App />)
  })
}
