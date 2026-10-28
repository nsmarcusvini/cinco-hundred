import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/ui'
import { toast } from '../../components/Toast'
import { formatBRL } from '../../lib/format'
import { useProfile, type Profile } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { useUserId } from '../auth/AuthProvider'

interface Row {
  display_name: string
  saved: number
  position: number
  is_me: boolean
}

/** Ranking geral por valor guardado. Só entra quem escolheu aparecer (onboarding ou Configurações). */
export default function RankingPage() {
  const uid = useUserId()
  const { data: profile } = useProfile()
  const { data: rows, isPending } = useQuery({
    queryKey: ['global-ranking', uid],
    staleTime: 0, // entrou ou saiu do ranking em Configurações: a lista já vem atualizada
    queryFn: async () => {
      const { data, error } = await supabase.rpc('global_ranking')
      if (error) throw error
      return data as Row[]
    },
  })
  const me = rows?.find((r) => r.is_me)

  return (
    <div className="space-y-6 py-6">
      <header>
        <h1 className="text-xl font-bold">Ranking geral</h1>
        <p className="mt-1 text-muted">Quem mais guardou marcando blocos. Só aparece quem escolheu aparecer.</p>
      </header>

      {profile && !profile.show_in_global_ranking && <JoinCard profile={profile} />}
      {me && (
        <p className="rounded-field bg-forest p-4 text-cream">
          Você está em <strong className="num text-gold">{me.position}º</strong> lugar, com{' '}
          <strong className="num">{formatBRL(me.saved)}</strong> guardados.
        </p>
      )}

      {isPending && <div className="h-40 rounded-field bg-line/50" aria-hidden />}
      {rows?.length === 0 && (
        <p className="rounded-field border-2 border-dashed border-line p-4 text-muted">
          Ninguém entrou no ranking ainda. Marque seus blocos e seja a primeira pessoa da lista.
        </p>
      )}
      {!!rows?.length && (
        <ol className="divide-y divide-line">
          {rows.map((r) => (
            <li key={`${r.position}-${r.display_name}-${r.is_me}`}
              className={`flex items-center gap-3 py-2.5 ${r.is_me ? '-mx-2 rounded-field bg-gold/25 px-2 font-bold' : ''}`}>
              <span className={`num grid size-8 shrink-0 place-items-center rounded-block text-sm font-extrabold ${r.position <= 3 ? 'bg-gold text-forest' : 'border-2 border-line'}`}>
                {r.position}
              </span>
              <span className="flex-1 truncate">{r.display_name}{r.is_me && ' (você)'}</span>
              <span className="num font-bold">{formatBRL(r.saved)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted">
        O total é a soma dos blocos marcados em todos os seus desafios. Renda, gastos e plano nunca aparecem.
      </p>
    </div>
  )
}

function JoinCard({ profile }: { profile: Profile }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function join() {
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ show_in_global_ranking: true }).eq('id', profile.id)
    setBusy(false)
    if (error) return toast('Não foi possível entrar no ranking. Tente de novo.', 'error')
    qc.setQueryData<Profile>(['profile', profile.id], (p) => p && { ...p, show_in_global_ranking: true })
    await qc.invalidateQueries({ queryKey: ['global-ranking', profile.id] })
  }

  return (
    <div className="rounded-field border-2 border-forest p-4">
      <p>Você não aparece no ranking. Seu nome e o total que você marcou nos blocos ficam visíveis para quem usa o app.</p>
      <Button className="mt-3" disabled={busy} onClick={join}>Aparecer no ranking</Button>
    </div>
  )
}
