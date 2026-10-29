import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { Button } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { authMessage, Field, inputCls, PasswordInput } from './fields'

/** /entrar — e-mail e senha. "Esqueci minha senha" manda um link para criar outra. */
export default function Login() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/app'
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={next} replace />

  const signupHref = `/cadastro${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`

  async function signIn(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(authMessage(error))
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/redefinir-senha` })
    setBusy(false)
    if (error) return setError(authMessage(error))
    setSentTo(email.trim())
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-10">
      <p className="text-lg font-extrabold text-forest">Tijoblock</p>
      {sentTo ? (
        <>
          <h1 className="mt-6 text-xl font-bold">Confira seu e-mail</h1>
          <p className="mt-2">
            Se existir uma conta com <strong>{sentTo}</strong>, enviamos um link para criar uma senha nova. Depois é só
            voltar aqui e entrar.
          </p>
          <Button variant="ghost" className="mt-6 self-start px-0" onClick={() => { setSentTo(null); setMode('login') }}>
            Voltar para o login
          </Button>
        </>
      ) : mode === 'reset' ? (
        <>
          <h1 className="mt-6 text-xl font-bold">Criar uma senha nova</h1>
          <p className="mt-2 text-muted">Mandamos um link para o seu e-mail. Também serve para quem entrava pelo link e ainda não tem senha.</p>
          <form onSubmit={sendReset} className="mt-6 flex flex-col gap-4">
            <Field id="email" label="E-mail">
              <input id="email" type="email" required autoFocus autoComplete="email" inputMode="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </Field>
            {error && <p role="alert" className="text-danger">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link'}</Button>
          </form>
          <Button variant="ghost" className="mt-2 self-start px-0" onClick={() => { setMode('login'); setError(null) }}>
            Lembrei a senha
          </Button>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-xl font-bold">Entrar</h1>
          <form onSubmit={signIn} className="mt-6 flex flex-col gap-4">
            <Field id="email" label="E-mail">
              <input id="email" type="email" required autoFocus autoComplete="email" inputMode="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </Field>
            <Field id="password" label="Senha">
              <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} />
            </Field>
            {error && <p role="alert" className="text-danger">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
          </form>
          <Button variant="ghost" className="mt-2 self-start px-0" onClick={() => { setMode('reset'); setError(null) }}>
            Esqueci minha senha
          </Button>
          <p className="mt-8 border-t border-line pt-6">
            Ainda não tem conta?{' '}
            <Link to={signupHref} className="font-semibold text-forest underline underline-offset-4">Criar conta</Link>
          </p>
        </>
      )}
    </main>
  )
}
