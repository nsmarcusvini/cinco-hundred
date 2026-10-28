// Cliente montado com os pacotes separados (no lugar do supabase-js) para caber no orçamento de JS inicial:
// auth + banco carregam de cara; realtime só quando uma tela assina; Edge Functions são um fetch.
import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'
import type { RealtimeClient } from '@supabase/realtime-js'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

const auth = new AuthClient({
  url: `${URL_}/auth/v1`,
  headers: { apikey: KEY },
  storageKey: `sb-${new URL(URL_).hostname.split('.')[0]}-auth-token`, // mesma chave do supabase-js: mantém a sessão
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
  flowType: 'pkce',
})

async function accessToken(): Promise<string | null> {
  const { data } = await auth.getSession()
  return data.session?.access_token ?? null
}

const rest = new PostgrestClient(`${URL_}/rest/v1`, {
  headers: { apikey: KEY },
  fetch: async (input, init) => {
    const headers = new Headers(init?.headers)
    const token = await accessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  },
})

/** Edge Function com o token do usuário. Mesmo formato de retorno do supabase-js. */
async function invoke(name: string, { body }: { body?: unknown } = {}) {
  try {
    const token = await accessToken()
    const res = await fetch(`${URL_}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    })
    const data = await res.json().catch(() => null)
    return res.ok ? { data, error: null } : { data: null, error: new Error(`HTTP ${res.status}`) }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

let realtimeClient: Promise<RealtimeClient> | null = null

/** Realtime sob demanda (carrega o pacote só na primeira assinatura). */
export function realtime(): Promise<RealtimeClient> {
  realtimeClient ??= import('@supabase/realtime-js').then(async ({ RealtimeClient }) => {
    const rt = new RealtimeClient(`${URL_.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: KEY }, accessToken })
    // Como o supabase-js faz: token resolvido antes do primeiro canal (senão ele entra anônimo e o RLS
    // filtra todos os eventos) e reenviado a cada login/renovação/saída.
    await rt.setAuth()
    auth.onAuthStateChange(() => void rt.setAuth())
    return rt
  })
  return realtimeClient
}

export const supabase = {
  auth,
  from: (table: string) => rest.from(table),
  rpc: (fn: string, args?: Record<string, unknown>) => rest.rpc(fn, args),
  functions: { invoke },
}
