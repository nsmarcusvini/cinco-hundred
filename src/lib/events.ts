// Sem dependências: roda também na landing, que não carrega o cliente do Supabase.

/** Caminho sem ids nem códigos ("/app/d/:id"): é isso que vai para os eventos, nunca o endereço real. */
export const genericRoute = (path = location.pathname) =>
  path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/^\/convite\/[^/]+/, '/convite/:code').replace(/^\/m\/[^/]+/, '/m/:slug')

/** Navegadores automáticos (CI, Lighthouse) não são visita nem medição de campo. */
export const isAutomated = () => /Chrome-Lighthouse|HeadlessChrome/.test(navigator.userAgent)

/**
 * Evento sem usuário, por fetch direto. Nomes e chaves aceitos: lista em events_guard
 * (supabase/migrations/20261104140000_admin_panel.sql).
 */
export function postEvent(name: string, props: Record<string, unknown>) {
  void fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/events`, {
    method: 'POST',
    keepalive: true, // o CLS e o INP chegam quando a página é escondida
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ name, props }),
  }).catch(() => {})
}
