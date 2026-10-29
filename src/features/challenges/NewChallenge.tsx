import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { toast } from '../../components/Toast'
import { Button, Choice } from '../../components/ui'
import { track } from '../../lib/analytics'
import { totalOf } from '../../lib/blocks'
import { formatBRL } from '../../lib/format'
import { useActivePlan, useProfile } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { useUserId } from '../auth/AuthProvider'

const PRESETS = [100, 200, 250, 300, 400, 500]
type Kind = 'solo' | 'duo' | 'group'

export default function NewChallenge() {
  const { data: profile } = useProfile()
  const { data: plan } = useActivePlan()
  if (!profile) return null
  if (!profile.has_access) return <Navigate to="/app/acesso" replace />
  // Quem disse no cadastro que vai guardar com alguém já começa em dupla.
  return <Form displayName={profile.display_name ?? ''} initialBlocks={plan?.recommended_blocks ?? 500}
    initialType={profile.saving_with === 'junto' ? 'duo' : 'solo'} />
}

function Form({ displayName, initialBlocks, initialType }: { displayName: string; initialBlocks: number; initialType: Kind }) {
  const uid = useUserId()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [blocks, setBlocks] = useState(initialBlocks)
  const [custom, setCustom] = useState(!PRESETS.includes(initialBlocks))
  const [title, setTitle] = useState(`Desafio ${initialBlocks}`)
  const [titleTouched, setTitleTouched] = useState(false)
  const [type, setType] = useState<Kind>(initialType)
  const [deadline, setDeadline] = useState('') // AAAA-MM
  const [busy, setBusy] = useState(false)

  const valid = blocks >= 10 && blocks <= 1000 && title.trim().length > 0
  const monthsLeft = deadline ? monthsUntil(deadline) : null
  const pickBlocks = (n: number) => {
    setBlocks(n)
    if (!titleTouched) setTitle(`Desafio ${n}`)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    const { data, error } = await supabase.rpc('create_challenge', {
      p_title: title.trim(),
      p_blocks: blocks,
      p_type: type,
      p_name: displayName || 'Eu',
      p_target_date: deadline ? lastDayOf(deadline) : null,
    })
    setBusy(false)
    if (error) return toast(error.message.includes('Limite') ? error.message : 'Não foi possível criar o desafio. Tente de novo.', 'error')
    track('challenge_created', { blocks, type })
    await qc.invalidateQueries({ queryKey: ['challenges', uid] })
    navigate(`/app/d/${data}`, { replace: true })
  }

  return (
    <form onSubmit={submit} className="space-y-7 py-6 pb-28">
      <h1 className="text-xl font-bold">Novo desafio</h1>

      <section>
        <p className="mb-2 font-medium">Quantos blocos?</p>
        <div role="radiogroup" aria-label="Tamanho do desafio" className="grid grid-cols-3 gap-2">
          {PRESETS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={!custom && blocks === n}
              onClick={() => { setCustom(false); pickBlocks(n) }}
              className={`rounded-field border-2 px-3 py-3 text-left ${!custom && blocks === n ? 'border-forest bg-forest text-cream' : 'border-line'}`}>
              <span className="num block text-lg font-extrabold">{n}</span>
              <span className="num text-xs opacity-80">{formatBRL(totalOf(n))}</span>
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-3">
          <input type="checkbox" className="size-5 accent-forest" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
          Outro tamanho
        </label>
        {custom && (
          <div className="mt-2 flex items-baseline gap-3">
            <input type="number" inputMode="numeric" min={10} max={1000} value={blocks || ''} autoFocus aria-label="Número de blocos"
              onChange={(e) => pickBlocks(Number(e.target.value))}
              className="num w-28 border-b-2 border-line bg-transparent text-2xl font-extrabold outline-none focus:border-forest" />
            <span className="text-muted">
              {blocks >= 10 && blocks <= 1000 ? `blocos, ${formatBRL(totalOf(blocks))}` : 'de 10 a 1000 blocos'}
            </span>
          </div>
        )}
      </section>

      <section>
        <label htmlFor="title" className="mb-2 block font-medium">Nome</label>
        <input id="title" maxLength={60} value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true) }}
          className="min-h-12 w-full rounded-field border-2 border-line bg-transparent px-3 outline-none focus:border-forest" />
      </section>

      <section>
        <p className="mb-2 font-medium">Quem vai juntar?</p>
        <Choice<Kind> label="Tipo de desafio" value={type} onChange={setType}
          options={[{ value: 'solo', label: 'Só eu' }, { value: 'duo', label: 'Em dupla' }, { value: 'group', label: 'Em grupo (até 8)' }]} />
      </section>

      <section>
        <label htmlFor="deadline" className="mb-2 block font-medium">Prazo (opcional)</label>
        <input id="deadline" type="month" value={deadline} min={nextMonth()} onChange={(e) => setDeadline(e.target.value)}
          className="min-h-12 rounded-field border-2 border-line bg-transparent px-3 outline-none focus:border-forest" />
        {monthsLeft !== null && monthsLeft > 0 && blocks >= 10 && (
          <p className="mt-2">
            Para cumprir, guarde cerca de <strong className="num">{formatBRL(totalOf(blocks) / monthsLeft)}</strong> por mês.
          </p>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto max-w-[760px] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="submit" className="w-full" disabled={!valid || busy}>
            Criar desafio de {blocks >= 10 && blocks <= 1000 ? formatBRL(totalOf(blocks)) : '…'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function nextMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 7)
}

function monthsUntil(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const now = new Date()
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + 1
}

function lastDayOf(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
