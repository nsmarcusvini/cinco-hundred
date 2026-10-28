// Convite ou movimento que a pessoa abriu antes de entrar/pagar: retomado depois do login,
// do onboarding e do checkout.
export type Pending = { kind: 'invite'; code: string } | { kind: 'movement'; slug: string }

const KEY = 'ch.pending'

export function setPending(p: Pending) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage indisponível */
  }
}

export function getPending(): Pending | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export const pendingPath = (p: Pending) => (p.kind === 'invite' ? `/convite/${p.code}` : `/m/${p.slug}`)
