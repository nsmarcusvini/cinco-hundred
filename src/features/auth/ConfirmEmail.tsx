import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { ResendConfirmation } from './ResendConfirmation'

type State = 'verifying' | 'done' | 'invalid'

/** Erro que o Supabase põe na URL quando o link padrão (/auth/v1/verify) falha: vem na query ou no hash. */
function urlError(params: URLSearchParams): string | null {
  const hash = new URLSearchParams(location.hash.slice(1))
  return params.get('error_code') ?? hash.get('error_code') ?? params.get('error') ?? hash.get('error')
}

/**
 * /confirmar — destino do link do e-mail de confirmação (?token_hash=&type=email).
 * O token_hash é trocado por sessão aqui, então funciona em qualquer navegador (o link PKCE só no que fez o cadastro).
 * Depois de confirmado, segue para o onboarding, que retoma convite/movimento pendente.
 */
export default function ConfirmEmail() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const type = params.get('type') === 'signup' ? 'signup' : 'email'
  const [state, setState] = useState<State>(() => (tokenHash ? 'verifying' : urlError(params) ? 'invalid' : 'verifying'))
  const started = useRef(false)

  useEffect(() => {
    if (!tokenHash || started.current) return
    started.current = true // o StrictMode roda o efeito duas vezes; o token só vale uma
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      // Limpa o token da barra de endereço (histórico, prints, compartilhamento).
      history.replaceState(null, '', '/confirmar')
      setState(error ? 'invalid' : 'done')
    })
  }, [tokenHash, type])

  // Sem token: se já há sessão (link aberto de novo, ou fluxo padrão com ?code=), a conta está confirmada.
  useEffect(() => {
    if (tokenHash || loading || state !== 'verifying') return
    setState(session ? 'done' : 'invalid')
  }, [tokenHash, loading, session, state])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-10">
      <p className="text-lg font-extrabold text-forest">Tijoloblock</p>

      {state === 'verifying' && (
        <p role="status" className="mt-6 text-muted">Confirmando seu e-mail…</p>
      )}

      {state === 'done' && (
        <>
          <h1 className="mt-6 text-xl font-bold">E-mail confirmado!</h1>
          <p className="mt-2">Tudo certo com sua conta. Agora vamos montar seu plano, leva só alguns minutos.</p>
          <Button className="mt-6" onClick={() => navigate('/onboarding', { replace: true })}>Continuar cadastro</Button>
        </>
      )}

      {state === 'invalid' && (
        session ? (
          <>
            <h1 className="mt-6 text-xl font-bold">Seu e-mail já está confirmado</h1>
            <p className="mt-2">Este link já foi usado, mas sua conta está ativa.</p>
            <Button className="mt-6" onClick={() => navigate('/onboarding', { replace: true })}>Continuar</Button>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-bold">Este link não vale mais</h1>
            <p className="mt-2">
              Ele expirou (vale por 1 hora), já foi usado ou um link mais novo foi enviado. Se você já confirmou, é só entrar. Se não, peça um link novo:
            </p>
            <div className="mt-6">
              <ResendConfirmation />
            </div>
            <Link to="/entrar" className="mt-6 font-semibold text-forest underline underline-offset-4">Já confirmei, quero entrar</Link>
          </>
        )
      )}
    </main>
  )
}
