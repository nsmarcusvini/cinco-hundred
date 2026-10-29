import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { Button } from '../../components/ui'
import { track } from '../../lib/analytics'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { authMessage, Field, inputCls, MIN_PASSWORD, PasswordInput, passwordProblem } from './fields'

/**
 * /cadastro — o essencial para abrir a conta: nome, e-mail, senha e o aceite dos termos.
 * O resto (objetivo, renda, cidade…) o onboarding pergunta, com contexto.
 */
export default function Signup() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmTo, setConfirmTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Conta nova passa pelo onboarding; ele mesmo segue para o convite/movimento pendente no final.
  if (session) return <Navigate to={next || '/onboarding'} replace />

  const weak = password ? passwordProblem(password) : null

  async function signUp(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim(), terms_accepted_at: new Date().toISOString() }, // o trigger copia o nome para o profile
        emailRedirectTo: `${location.origin}/entrar`,
      },
    })
    setBusy(false)
    if (error) return setError(authMessage(error))
    track('signup')
    // Com confirmação de e-mail ligada no Supabase, a sessão só vem depois do link.
    if (!data.session) setConfirmTo(email.trim())
  }

  if (confirmTo) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-10">
        <p className="text-lg font-extrabold text-forest">Tijoblock</p>
        <h1 className="mt-6 text-xl font-bold">Confirme seu e-mail</h1>
        <p className="mt-2">Enviamos um link para <strong>{confirmTo}</strong>. Depois de abrir o link, entre com seu e-mail e senha.</p>
        <Link to="/entrar" className="mt-6 font-semibold text-forest underline underline-offset-4">Ir para o login</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-10">
      <p className="text-lg font-extrabold text-forest">Tijoblock</p>
      <h1 className="mt-6 text-xl font-bold">Criar sua conta</h1>
      <p className="mt-2 text-muted">Leva menos de um minuto. Depois montamos seu plano juntos.</p>
      <form onSubmit={signUp} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="Como quer ser chamado(a)?">
          <input id="name" required autoFocus maxLength={40} autoComplete="given-name" value={name}
            onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field id="email" label="E-mail">
          <input id="email" type="email" required autoComplete="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field id="password" label="Senha" hint={weak ?? `Pelo menos ${MIN_PASSWORD} caracteres, com letras e números.`}>
          <PasswordInput id="password" autoComplete="new-password" value={password} onChange={setPassword} describedBy="password-hint" />
        </Field>
        <label className="flex items-start gap-3 py-1">
          <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 size-5 shrink-0 accent-forest" />
          <span>
            Li e concordo com os <a href="/termos" target="_blank" className="underline">termos de uso</a> e a{' '}
            <a href="/privacidade" target="_blank" className="underline">política de privacidade</a>.
          </span>
        </label>
        {error && <p role="alert" className="text-danger">{error}</p>}
        <Button type="submit" disabled={busy || !name.trim() || !terms}>{busy ? 'Criando conta…' : 'Criar conta'}</Button>
      </form>
      <p className="mt-8 border-t border-line pt-6">
        Já tem conta?{' '}
        <Link to={`/entrar${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-forest underline underline-offset-4">Entrar</Link>
      </p>
    </main>
  )
}
