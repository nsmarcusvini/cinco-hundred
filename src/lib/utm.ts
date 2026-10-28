// Sem dependências: roda também na landing, que não carrega o supabase-js.
const UTM_KEY = 'ch.utm'

/** Guarda utm_source/utm_campaign da primeira visita. */
export function captureUtm() {
  const p = new URLSearchParams(location.search)
  const source = p.get('utm_source')
  if (!source) return
  try {
    if (!localStorage.getItem(UTM_KEY)) {
      localStorage.setItem(UTM_KEY, JSON.stringify({ utm_source: source, utm_campaign: p.get('utm_campaign') }))
    }
  } catch {
    /* storage indisponível */
  }
}

export function readUtm(): { utm_source: string; utm_campaign: string | null } | null {
  try {
    return JSON.parse(localStorage.getItem(UTM_KEY) ?? 'null')
  } catch {
    return null
  }
}
