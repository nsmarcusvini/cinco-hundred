import { onCLS, onINP, onLCP, type Metric } from 'web-vitals'
import { genericRoute, isAutomated, postEvent } from './events'

/** Web Vitals de campo (LCP, INP, CLS) para a tabela events, sem usuário e com a rota genérica. */
function send(m: Metric) {
  if (location.pathname.startsWith('/admin')) return // o painel não é uso do produto
  postEvent('web_vital', {
    metric: m.name,
    value: Math.round(m.name === 'CLS' ? m.value * 1000 : m.value),
    rating: m.rating,
    route: genericRoute(),
  })
}

export function reportVitals() {
  if (isAutomated()) return // medições do CI não são de campo
  onLCP(send)
  onINP(send)
  onCLS(send)
}
