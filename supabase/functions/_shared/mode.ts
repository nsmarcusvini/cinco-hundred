// Modo da Stripe (teste ou live) deduzido da própria chave, para nada do outro modo entrar no fluxo.

/** Chave secreta ou restrita do modo live. */
export const isLiveKey = (key: string | undefined) => /^(sk|rk)_live_/.test(key ?? '')

/**
 * Cobrança em live só abre com CHECKOUT_ENABLED=true: dá para deixar tudo configurado e ligar depois.
 * No modo teste segue aberta, como sempre foi.
 */
export const checkoutOpen = (live: boolean, flag: string | undefined) => !live || flag === 'true'

/** Customer que não existe neste modo (ex.: criado no teste) ou que foi apagado. */
export const isGoneCustomer = (c: { deleted?: unknown } | null, error?: unknown) =>
  c?.deleted === true || (error as { code?: string } | undefined)?.code === 'resource_missing'
