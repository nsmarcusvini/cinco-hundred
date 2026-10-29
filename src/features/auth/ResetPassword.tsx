import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '../../components/ui'
import { toast } from '../../components/Toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { authMessage, Field, MIN_PASSWORD, PasswordInput, passwordProblem } from './fields'

/**
 * /redefinir-senha — destino do link de "Esqueci minha senha".
 * Aceita os dois formatos de link do Supabase: ?code= (padrão, PKCE: só funciona no navegador que pediu)
 * e ?token_hash=&type=recovery (template personalizado: funciona em qualquer navegador).
 */
export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const [verifying, setVerifying] = useState(!!tokenHash)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!tokenHash) return
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(() => setVerifying(false))
  }, [tokenHash])

  async function save(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(authMessage(error))
    toast('Senha nova salva.')
    navigate('/app', { replace: true })
  }

  if (loading || verifying) return null

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-10">
      <p className="text-lg font-extrabold text-forest">Tijoblock</p>
      {session ? (
        <>
          <h1 className="mt-6 text-xl font-bold">Crie sua senha nova</h1>
          <form onSubmit={save} className="mt-6 flex flex-col gap-4">
            <Field id="password" label="Senha nova" hint={(password && passwordProblem(password)) || `Pelo menos ${MIN_PASSWORD} caracteres, com letras e números.`}>
              <PasswordInput id="password" autoFocus autoComplete="new-password" value={password} onChange={setPassword} describedBy="password-hint" />
            </Field>
            {error && <p role="alert" className="text-danger">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha'}</Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-xl font-bold">Este link não vale mais</h1>
          <p className="mt-2">
            O link expirou, já foi usado ou foi aberto em outro navegador. Peça um novo e abra no mesmo aparelho em que
            pediu.
          </p>
          <Link to="/entrar" className="mt-6 font-semibold text-forest underline underline-offset-4">Pedir um link novo</Link>
        </>
      )}
    </main>
  )
}
