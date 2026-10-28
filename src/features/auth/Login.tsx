import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Button } from '../../components/ui'
import { toast } from '../../components/Toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

export default function Login() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/app'
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={next} replace />

  // Função, não valor: a tela também é renderizada no build (scripts/prerender.mjs), onde não há location.
  const redirectTo = () => `${location.origin}/entrar?next=${encodeURIComponent(next)}`

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } })
    setBusy(false)
    if (error) return toast('Não foi possível enviar o link. Confira o e-mail e tente de novo.', 'error')
    setSentTo(email.trim())
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })
    if (error) toast('O login com Google não está disponível agora. Use o link por e-mail.', 'error')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col justify-center px-4 py-10">
      <p className="text-lg font-extrabold text-forest">Cinco Hundred</p>
      {sentTo ? (
        <>
          <h1 className="mt-6 text-xl font-bold">Confira seu e-mail</h1>
          <p className="mt-2">
            Enviamos um link de acesso para <strong>{sentTo}</strong>. Abra o link neste aparelho para entrar.
          </p>
          <Button variant="ghost" className="mt-6 self-start px-0" onClick={() => setSentTo(null)}>Usar outro e-mail</Button>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-xl font-bold">Entrar</h1>
          <p className="mt-2 text-muted">Sem senha: mandamos um link para o seu e-mail.</p>
          <form onSubmit={sendLink} className="mt-6 flex flex-col gap-3">
            <label htmlFor="email" className="font-medium">E-mail</label>
            <input id="email" type="email" required autoFocus autoComplete="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-12 rounded-field border-2 border-line bg-transparent px-3 outline-none focus:border-forest" />
            <Button type="submit" disabled={busy}>Receber link de acesso</Button>
          </form>
          <Button variant="secondary" className="mt-3" onClick={google}>Entrar com Google</Button>
          <p className="mt-6 text-xs text-muted">
            Ao entrar você concorda com os <a href="/termos" className="underline">termos</a> e a{' '}
            <a href="/privacidade" className="underline">política de privacidade</a>.
          </p>
        </>
      )}
    </main>
  )
}
