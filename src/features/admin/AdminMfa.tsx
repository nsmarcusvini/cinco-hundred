import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Button } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAdminStatus } from '../auth/guards'

interface Setup {
  factorId: string
  qr?: string // só no primeiro cadastro
  secret?: string
}

/** Verificação em duas etapas do painel. O código vira uma sessão aal2, que é o que as RPCs conferem. */
export default function AdminMfa() {
  const { data: status, isPending } = useAdminStatus()
  const qc = useQueryClient()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (status !== 'mfa' || started.current) return
    started.current = true
    void (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) return setError('Não foi possível abrir a verificação. Recarregue a página.')
      const verified = data.totp[0]
      if (verified) return setSetup({ factorId: verified.id })

      // Cadastro interrompido deixa um fator pendente, que impediria criar outro.
      for (const f of data.all) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Painel Tijoloblock' })
      if (enrollError) return setError('Não foi possível criar a verificação. Recarregue a página.')
      setSetup({ factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret })
    })()
  }, [status])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!setup) return
    setBusy(true)
    setError('')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.factorId, code: code.trim() })
    setBusy(false)
    if (verifyError) {
      setCode('')
      return setError('Código incorreto ou vencido. Digite o código que está no app agora.')
    }
    await qc.invalidateQueries({ queryKey: ['admin', 'status'] })
  }

  if (isPending) return null
  if (status === 'ok') return <Navigate to="/admin" replace />
  if (status !== 'mfa') return <Navigate to="/app" replace />

  return (
    <main className="mx-auto max-w-[440px] px-4 py-10">
      <title>Verificação | Tijoloblock</title>
      <meta name="robots" content="noindex, nofollow" />
      <h1 className="text-xl font-bold">{setup?.qr ? 'Proteja o painel' : 'Digite seu código'}</h1>
      {setup?.qr ? (
        <>
          <p className="mt-2 text-muted">
            Aponte a câmera do seu app autenticador (Google Authenticator, 1Password ou outro) para o código abaixo.
            Depois digite os 6 números que ele mostrar. Se recarregar esta página, o QR code muda: apague o item antigo do app e leia o novo.
          </p>
          <img src={setup.qr} alt="QR code para o app autenticador" width={200} height={200} className="mt-4 rounded-block bg-white p-2" />
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer">Não consigo ler o QR code</summary>
            <p className="mt-1">Digite esta chave no app: <code className="break-all text-ink">{setup.secret}</code></p>
          </details>
        </>
      ) : (
        <p className="mt-2 text-muted">Abra seu app autenticador e digite os 6 números do Tijoloblock.</p>
      )}

      <form onSubmit={submit} className="mt-6">
        <label htmlFor="code" className="font-semibold">Código de 6 números</label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="num mt-1 block w-full border-b-2 border-line bg-transparent py-1 text-3xl font-extrabold tracking-[0.2em] outline-none focus:border-forest"
        />
        {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
        <Button type="submit" className="mt-6 w-full" disabled={busy || !setup || code.length !== 6}>
          {busy ? 'Conferindo…' : 'Entrar no painel'}
        </Button>
      </form>
    </main>
  )
}
