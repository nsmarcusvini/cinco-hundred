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

/**
 * Origem para enviar no cadastro (metadados do signUp). O trigger handle_new_user grava no perfil na hora da
 * criação da conta, então a origem não se perde se o link de confirmação abrir em outro navegador.
 */
export function utmMetadata(): { utm_source?: string; utm_campaign?: string } {
  const utm = readUtm()
  if (!utm?.utm_source) return {}
  return { utm_source: utm.utm_source, ...(utm.utm_campaign ? { utm_campaign: utm.utm_campaign } : {}) }
}
