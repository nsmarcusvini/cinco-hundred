import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { captureInstallPrompt } from './lib/install'
import { captureUtm } from './lib/utm'
import './index.css'

captureUtm()
captureInstallPrompt()
// Fora do caminho crítico: só depois do load. CLS guardado como milésimos (0,05 = 50).
if (import.meta.env.PROD) addEventListener('load', () => void import('./lib/vitals').then((m) => m.reportVitals()), { once: true })
registerSW({ immediate: true })

// Duas portas de entrada: a landing (/) não carrega o app (supabase-js, router, query...) e vice-versa.
const root = createRoot(document.getElementById('root')!)
if (location.pathname === '/') {
  void import('./landing/Landing').then(({ default: Landing }) => root.render(<Landing />))
} else {
  void import('./app/App').then(({ default: App }) => root.render(<App />))
}
