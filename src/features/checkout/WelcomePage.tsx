import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui'
import { confetti } from '../../lib/confetti'
import { getPending, pendingPath } from '../../lib/pending'
import { useProfile } from '../../lib/queries'
import { realtime } from '../../lib/supabase'
import { useUserId } from '../auth/AuthProvider'

const POLL_MS = 3000
const TIMEOUT_MS = 60_000

/**
 * /app/bem-vindo — volta do Checkout. Não libera nada: só espera o webhook mudar o profile
 * (Realtime e, como reserva, consulta a cada 3 s por até 60 s).
 */
export default function WelcomePage() {
  const uid = useUserId()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const [timedOut, setTimedOut] = useState(false)
  const celebrated = useRef(false)
  const granted = !!profile?.has_access

  useEffect(() => {
    if (granted) return
    const refresh = () => qc.invalidateQueries({ queryKey: ['profile', uid] })
    let unsubscribe = () => {}
    let cancelled = false
    void realtime().then((rt) => {
      if (cancelled) return
      const channel = rt
        .channel(`profile:${uid}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, refresh)
        .subscribe()
      unsubscribe = () => void rt.removeChannel(channel)
    })
    const poll = setInterval(refresh, POLL_MS)
    const stop = setTimeout(() => {
      clearInterval(poll)
      setTimedOut(true)
    }, TIMEOUT_MS)
    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(poll)
      clearTimeout(stop)
    }
  }, [granted, uid, qc])

  useEffect(() => {
    if (granted && !celebrated.current) {
      celebrated.current = true
      confetti()
    }
  }, [granted])

  const next = () => {
    const pending = getPending()
    if (!profile?.onboarding_done) return navigate('/onboarding', { replace: true })
    navigate(pending ? pendingPath(pending) : '/app/novo', { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col justify-center px-4 py-10" aria-live="polite">
      {granted ? (
        <>
          <h1 className="text-3xl leading-tight font-extrabold">Acesso liberado para sempre 🎉</h1>
          <p className="mt-3 text-lg">Agora é com você: crie seu desafio e marque o primeiro bloco hoje.</p>
          <Button className="mt-8" onClick={next}>Continuar</Button>
        </>
      ) : timedOut ? (
        <>
          <h1 className="text-xl font-bold">Estamos aguardando a confirmação</h1>
          <p className="mt-3">
            Assim que o pagamento for confirmado, liberamos automaticamente e te avisamos. Pagamentos como boleto podem
            levar até 3 dias úteis.
          </p>
          <Button variant="secondary" className="mt-8" onClick={() => navigate('/app', { replace: true })}>Ir para o início</Button>
        </>
      ) : (
        <>
          <div className="mb-6 flex gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-4 animate-pulse rounded-[3px] bg-leaf" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </div>
          <h1 className="text-xl font-bold">Confirmando pagamento…</h1>
          <p className="mt-2 text-muted">Isso leva poucos segundos. Pode deixar esta tela aberta.</p>
        </>
      )}
    </main>
  )
}
