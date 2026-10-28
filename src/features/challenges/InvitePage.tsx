import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from '../../components/Toast'
import { Button, GridPreview } from '../../components/ui'
import { totalOf } from '../../lib/blocks'
import { formatBRL } from '../../lib/format'
import { setPending } from '../../lib/pending'
import { useProfile } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { joinByCode } from './join'

interface Preview {
  title: string
  blocks: number
  type: 'solo' | 'duo' | 'group'
  owner_name: string
  members: number
}

/** /convite/:code — abre sem login. */
export default function InvitePage() {
  const { code = '' } = useParams()
  const { session, loading } = useAuth()
  const { data: preview, isPending } = useQuery({
    queryKey: ['invite', code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invite_preview', { p_code: code })
      if (error) throw error
      return (data as Preview[])[0] ?? null
    },
  })

  // Guarda o convite para retomar depois do login, do onboarding ou do pagamento.
  useEffect(() => {
    if (preview) setPending({ kind: 'invite', code })
  }, [preview, code])

  const full = preview && preview.members >= (preview.type === 'duo' ? 2 : 8)

  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col px-4 py-8">
      <Link to="/" className="text-lg font-extrabold text-forest">Tijoblock</Link>
      {isPending || loading ? (
        <div className="mt-10 space-y-3" aria-hidden>
          <div className="h-8 w-3/4 rounded-block bg-line/60" />
          <div className="h-40 rounded-block bg-line/40" />
        </div>
      ) : !preview ? (
        <div className="mt-10">
          <h1 className="text-xl font-bold">Convite não encontrado</h1>
          <p className="mt-2 text-muted">Confira o link com quem te chamou. O desafio pode ter sido arquivado.</p>
        </div>
      ) : (
        <>
          <h1 className="mt-10 text-2xl leading-tight font-extrabold text-balance">
            {preview.owner_name} te chamou para juntar {formatBRL(totalOf(preview.blocks))}
          </h1>
          <p className="mt-3 text-lg">
            No desafio <strong>{preview.title}</strong>, cada um guarda na própria conta e marca os blocos numa grade
            compartilhada, com uma cor para cada pessoa. O app não movimenta dinheiro.
          </p>
          <div className="mt-6"><GridPreview blocks={preview.blocks} /></div>
          <p className="mt-3 text-sm text-muted">
            {preview.blocks} blocos, {preview.members} de {preview.type === 'duo' ? 2 : 8} pessoas
          </p>
          <div className="mt-auto pt-8">
            {full ? (
              <p className="rounded-field bg-gold/25 p-4">Este desafio já está completo. Peça um novo convite ou crie o seu.</p>
            ) : session ? (
              <JoinForm code={code} />
            ) : (
              <Link to={`/entrar?next=${encodeURIComponent(`/convite/${code}`)}`}
                className="flex min-h-12 items-center justify-center rounded-field bg-forest px-5 font-semibold text-cream">
                Entrar para participar
              </Link>
            )}
          </div>
        </>
      )}
    </main>
  )
}

function JoinForm({ code }: { code: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: profile } = useProfile()
  const [name, setName] = useState('')
  useEffect(() => {
    if (profile?.display_name) setName((n) => n || profile.display_name!)
  }, [profile])
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await joinByCode(code, name)
    setBusy(false)
    if (r.ok) {
      await qc.invalidateQueries({ queryKey: ['challenges'] })
      return navigate(`/app/d/${r.id}`, { replace: true })
    }
    if (r.needsAccess) return navigate('/app/acesso')
    toast(r.message, 'error')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="name" className="block font-medium">Seu nome no desafio</label>
      <input id="name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
        className="min-h-12 w-full rounded-field border-2 border-line bg-transparent px-3 outline-none focus:border-forest" />
      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>Entrar no desafio</Button>
    </form>
  )
}
