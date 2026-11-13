import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { authMessage, Field, inputCls } from './fields'

/** Mesmo intervalo do `max_frequency` do Auth: antes disso o Supabase recusa o reenvio. */
const COOLDOWN_S = 60

/**
 * Reenvia o e-mail de confirmação do cadastro. Com `email`, mostra só o botão; sem, pede o e-mail antes.
 * O Supabase não conta se o e-mail existe, então a mensagem de sucesso é sempre a mesma.
 */
export function ResendConfirmation({ email: fixed, startCooldown = false }: { email?: string; startCooldown?: boolean }) {
  const [email, setEmail] = useState(fixed ?? '')
  const [wait, setWait] = useState(startCooldown ? COOLDOWN_S : 0)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function resend(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/confirmar` },
    })
    setBusy(false)
    if (error) return setError(authMessage(error))
    setSent(true)
    setWait(COOLDOWN_S)
  }

  const label = busy ? 'Enviando…' : wait > 0 ? `Reenviar em ${wait}s` : sent ? 'Reenviar de novo' : 'Reenviar e-mail'

  return (
    <form onSubmit={resend} className="flex flex-col gap-3">
      {!fixed && (
        <Field id="resend-email" label="Seu e-mail">
          <input id="resend-email" type="email" required autoComplete="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
      )}
      <Button type="submit" variant={fixed ? 'ghost' : undefined} className={fixed ? 'self-start px-0' : undefined}
        disabled={busy || wait > 0 || !email.trim()}>
        {label}
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-muted">
        {sent && 'Pronto! Se o e-mail estiver cadastrado e ainda sem confirmação, um link novo chega em instantes. Confira também o spam.'}
      </p>
      {error && <p role="alert" className="text-danger">{error}</p>}
    </form>
  )
}
