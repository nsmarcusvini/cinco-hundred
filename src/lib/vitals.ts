import { onCLS, onINP, onLCP, type Metric } from 'web-vitals'

/**
 * Web Vitals de campo (LCP, INP, CLS) para a tabela events, sem usuário e com a rota genérica
 * (ids e códigos viram ":id"). Usa fetch direto, sem o cliente do Supabase, para servir também à landing.
 */
const route = () =>
  location.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/^\/convite\/[^/]+/, '/convite/:code').replace(/^\/m\/[^/]+/, '/m/:slug')

function send(m: Metric) {
  void fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/events`, {
    method: 'POST',
    keepalive: true, // o CLS e o INP chegam quando a página é escondida
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      name: 'web_vital',
      props: { metric: m.name, value: Math.round(m.name === 'CLS' ? m.value * 1000 : m.value), rating: m.rating, route: route() },
    }),
  }).catch(() => {})
}

export function reportVitals() {
  if (/Chrome-Lighthouse|HeadlessChrome/.test(navigator.userAgent)) return // medições do CI não são de campo
  onLCP(send)
  onINP(send)
  onCLS(send)
}
