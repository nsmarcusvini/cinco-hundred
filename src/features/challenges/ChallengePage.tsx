import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Sheet } from '../../components/Sheet'
import { toast } from '../../components/Toast'
import { AnimatedBRL } from '../../components/AnimatedBRL'
import { Button, Choice, CurrencyInput } from '../../components/ui'
import { crossedMilestone, streak, suggestBlocks, totalOf } from '../../lib/blocks'
import { confetti } from '../../lib/confetti'
import { formatBRL } from '../../lib/format'
import { useProfile } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { useUserId } from '../auth/AuthProvider'
import {
  challengeKey, useChallenge, useChallengeRealtime, useMarkBlocks, useUnmarkBlock, type ChallengeDetail,
} from './api'
import { track } from '../../lib/analytics'
import { Grid } from './Grid'
import type { StoryData } from './storyCard'

type Filter = 'todos' | 'abertos' | 'marcados'
type Panel =
  | { kind: 'block'; block: number }
  | { kind: 'amount' }
  | { kind: 'menu' }
  | { kind: 'done' }
  | { kind: 'story' }
  | null

const MILESTONE_TEXT: Record<number, string> = {
  10: 'Primeiros 10%! O hábito começou.',
  25: 'Um quarto do caminho. Bora!',
  50: 'Metade! Daqui pra frente é ladeira abaixo.',
  75: '75%. A reta final está à vista.',
  90: '90%! Faltam poucos blocos.',
}

export default function ChallengePage() {
  const { id = '' } = useParams()
  const { data: c, isPending } = useChallenge(id)
  if (isPending) return <ChallengeSkeleton />
  if (!c) {
    return (
      <div className="py-10">
        <h1 className="text-xl font-bold">Desafio não encontrado</h1>
        <p className="mt-2 text-muted">Ele pode ter sido excluído ou você saiu do grupo.</p>
        <Link to="/app" className="mt-6 inline-block font-semibold text-forest underline">Voltar para o início</Link>
      </div>
    )
  }
  return <Challenge c={c} />
}

function ChallengeSkeleton() {
  return (
    <div className="space-y-4 py-6" aria-hidden>
      <div className="h-6 w-40 rounded-block bg-line/60" />
      <div className="h-12 w-56 rounded-block bg-line/60" />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }, (_, i) => <div key={i} className="aspect-square rounded-block bg-line/40" />)}
      </div>
    </div>
  )
}

function Challenge({ c }: { c: ChallengeDetail }) {
  const uid = useUserId()
  const { data: profile } = useProfile()
  const mark = useMarkBlocks(c.id)
  const unmark = useUnmarkBlock(c.id)
  useChallengeRealtime(c.id)
  const [filter, setFilter] = useState<Filter>('todos')
  const [panel, setPanel] = useState<Panel>(null)
  const [highlight, setHighlight] = useState<number | null>(null)

  const goal = totalOf(c.blocks)
  const byBlock = useMemo(() => new Map(c.marks.map((m) => [m.block, m])), [c.marks])
  const colorByUser = useMemo(() => new Map(c.members.map((m) => [m.user_id, m.color])), [c.members])
  const colorOf = useMemo(
    () => new Map(c.marks.map((m) => [m.block, colorByUser.get(m.user_id) ?? '#12a150'])),
    [c.marks, colorByUser],
  )
  const saved = c.marks.reduce((t, m) => t + m.block, 0)
  const pct = (saved / goal) * 100
  const free = useMemo(() => {
    const xs: number[] = []
    for (let n = 1; n <= c.blocks; n++) if (!byBlock.has(n)) xs.push(n)
    return xs
  }, [c.blocks, byBlock])
  const visible = useMemo(() => {
    const all = Array.from({ length: c.blocks }, (_, i) => i + 1)
    if (filter === 'abertos') return free
    if (filter === 'marcados') return all.filter((n) => byBlock.has(n))
    return all
  }, [filter, c.blocks, free, byBlock])
  const days = streak(c.marks.filter((m) => m.user_id === uid).map((m) => m.marked_at), profile?.timezone ?? 'America/Sao_Paulo')

  const doMark = (blocks: number[], via: 'tap' | 'amount' | 'draw') => {
    const after = ((saved + blocks.reduce((a, b) => a + b, 0)) / goal) * 100
    const milestone = crossedMilestone(pct, after)
    mark.mutate({ blocks, via })
    setPanel(milestone === 100 ? { kind: 'done' } : null)
    if (milestone) {
      confetti()
      if (milestone < 100) toast(MILESTONE_TEXT[milestone])
    }
  }

  const draw = () => {
    if (free.length === 0) return
    const n = free[Math.floor(Math.random() * free.length)]
    setFilter('todos')
    setHighlight(n)
    requestAnimationFrame(() => document.getElementById(`bloco-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    setTimeout(() => setPanel({ kind: 'block', block: n }), 450)
  }

  const onSelect = useCallback((block: number) => setPanel({ kind: 'block', block }), [])
  const close = useCallback(() => {
    setPanel(null)
    setHighlight(null)
  }, [])

  return (
    <div className="pb-28">
      <header className="pt-6">
        <div className="flex items-start gap-3">
          <h1 className="flex-1 text-lg font-bold">{c.title}</h1>
          <button type="button" aria-label="Mais opções" onClick={() => setPanel({ kind: 'menu' })}
            className="-mt-2 min-h-11 min-w-11 rounded-field text-xl font-bold text-forest">⋯</button>
        </div>
        <div className="-ml-2 flex flex-wrap items-center gap-1 text-sm">
          {c.type !== 'solo' && (
            <span className="px-2 text-muted">{c.members.length} de {c.type === 'duo' ? 2 : 8} pessoas</span>
          )}
          {c.type !== 'solo' && c.members.length < (c.type === 'duo' ? 2 : 8) && (
            <button type="button" onClick={() => invite(c)} className="min-h-11 rounded-field px-2 font-semibold text-forest">
              👥 Convidar
            </button>
          )}
          <Link to={`/app/d/${c.id}/historico`} className="inline-flex min-h-11 items-center rounded-field px-2 font-semibold text-forest">
            Histórico
          </Link>
          <button type="button" onClick={() => setPanel({ kind: 'story' })} className="min-h-11 rounded-field px-2 font-semibold text-forest">
            📸 Compartilhar
          </button>
        </div>
      </header>

      <section className="mt-2">
        <AnimatedBRL value={saved} className="block text-4xl font-extrabold" />
        <p className="text-muted">
          de <span className="num">{formatBRL(goal)}</span> · faltam <span className="num">{formatBRL(goal - saved)}</span>
        </p>
        <div className="mt-3 h-3 overflow-hidden rounded-[3px] bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="concluído" value={`${Math.floor(pct)}%`} />
          <Stat label="blocos" value={`${c.marks.length}/${c.blocks}`} />
          <Stat label={days === 1 ? 'dia seguido' : 'dias seguidos'} value={`🔥 ${days}`} />
        </dl>
      </section>

      {c.members.length > 1 && <GroupRanking c={c} uid={uid} />}

      <div className="mt-6 mb-3">
        <Choice<Filter> label="Filtrar blocos" value={filter} onChange={setFilter}
          options={[{ value: 'todos', label: 'Todos' }, { value: 'abertos', label: 'Abertos' }, { value: 'marcados', label: 'Marcados' }]} />
      </div>

      {visible.length ? (
        <Grid blocks={visible} colorOf={colorOf} highlight={highlight} onSelect={onSelect} />
      ) : (
        <p className="rounded-field border-2 border-dashed border-line p-5 text-muted">
          {filter === 'marcados' ? 'Nenhum bloco marcado ainda. Toque num bloco quando guardar o valor.' : 'Todos os blocos estão marcados. 🎉'}
        </p>
      )}

      {c.status !== 'archived' && free.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 backdrop-blur">
          <div className="mx-auto flex max-w-[760px] gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button className="flex-1 px-3 whitespace-nowrap" onClick={() => setPanel({ kind: 'amount' })}>💵 Guardei um valor</Button>
            <Button variant="secondary" className="flex-1 px-3 whitespace-nowrap" onClick={draw}>🎲 Sortear bloco</Button>
          </div>
        </div>
      )}

      <BlockSheet c={c} panel={panel} onClose={close} uid={uid} byBlock={byBlock}
        onMark={(b) => doMark([b], highlight === b ? 'draw' : 'tap')} onUnmark={(b) => { unmark.mutate(b); close() }} />
      <AmountSheet open={panel?.kind === 'amount'} onClose={close} free={free} onConfirm={(bs) => doMark(bs, 'amount')} />
      <MenuSheet c={c} open={panel?.kind === 'menu'} onClose={close} uid={uid} />
      <StorySheet open={panel?.kind === 'story'} onClose={close}
        data={{ title: c.title, blocks: c.blocks, marked: new Set(byBlock.keys()), saved, goal, streak: days }} />
      <Sheet open={panel?.kind === 'done'} onOpenChange={close} title="Desafio completo!">
        <p className="text-lg">
          Você juntou <strong className="num">{formatBRL(goal)}</strong>, bloco a bloco. Esse dinheiro é seu e está guardado.
        </p>
        <Button className="mt-6 w-full" onClick={close}>Ver minha grade</Button>
      </Sheet>
    </div>
  )
}

/** Convite pelo menu de compartilhar do celular; sem ele, copia o link. */
async function invite(c: ChallengeDetail) {
  const url = `${location.origin}/convite/${c.invite_code}`
  const text = `Bora juntar ${formatBRL(totalOf(c.blocks))} comigo no Cinco Hundred? Entra no meu desafio:`
  track('invite_sent', { type: c.type })
  if (navigator.share) {
    try {
      await navigator.share({ title: c.title, text, url })
    } catch {
      /* compartilhamento cancelado */
    }
    return
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`)
    toast('Link do convite copiado. É só colar na conversa.')
  } catch {
    toast(`Código do convite: ${c.invite_code}`)
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field border-2 border-line py-2">
      <dt className="sr-only">{label}</dt>
      <dd className="num text-lg font-extrabold">{value}</dd>
      <dd className="text-xs text-muted" aria-hidden>{label}</dd>
    </div>
  )
}

/** Ranking do grupo: quanto cada integrante guardou. A cor é a dos blocos que a pessoa marca na grade. */
function GroupRanking({ c, uid }: { c: ChallengeDetail; uid: string }) {
  const total = c.marks.reduce((t, m) => t + m.block, 0) || 1
  const rows = c.members
    .map((m) => ({ ...m, saved: c.marks.filter((x) => x.user_id === m.user_id).reduce((t, x) => t + x.block, 0) }))
    .sort((a, b) => b.saved - a.saved)
  return (
    <section aria-labelledby="ranking-grupo" className="mt-6">
      <h2 id="ranking-grupo" className="mb-1 font-bold">Ranking do grupo</h2>
      <ol className="divide-y divide-line">
        {rows.map((m) => {
          const position = rows.findIndex((r) => r.saved === m.saved) + 1 // empate divide a posição
          return (
            <li key={m.user_id} className="flex items-center gap-3 py-2">
              <span className="num w-6 text-right font-extrabold text-muted">{position}º</span>
              <span className="size-3 shrink-0 rounded-[3px]" style={{ background: m.color }} aria-hidden />
              <span className="flex-1 truncate">{m.display_name}{m.user_id === uid && ' (você)'}</span>
              <span className="num font-bold">{formatBRL(m.saved)}</span>
              <span className="num w-10 text-right text-sm text-muted">{Math.round((m.saved / total) * 100)}%</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function BlockSheet({ c, panel, onClose, uid, byBlock, onMark, onUnmark }: {
  c: ChallengeDetail
  panel: Panel
  onClose: () => void
  uid: string
  byBlock: Map<number, { user_id: string; marked_at: string }>
  onMark: (b: number) => void
  onUnmark: (b: number) => void
}) {
  const block = panel?.kind === 'block' ? panel.block : null
  const m = block ? byBlock.get(block) : undefined
  const who = m && c.members.find((x) => x.user_id === m.user_id)
  return (
    <Sheet open={block !== null} onOpenChange={onClose} title={block ? `Bloco ${block}, ${formatBRL(block)}` : ''}>
      {block && !m && (
        <>
          <p>Marque quando o valor já estiver guardado na sua conta ou investimento.</p>
          <Button className="mt-6 w-full" autoFocus disabled={c.status === 'archived'} onClick={() => onMark(block)}>✔ Guardei</Button>
        </>
      )}
      {block && m && (
        <>
          <p>
            Marcado por <strong>{m.user_id === uid ? 'você' : who?.display_name ?? 'alguém que saiu'}</strong> em{' '}
            {new Date(m.marked_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
          {m.user_id === uid && (
            <Button variant="secondary" className="mt-6 w-full" onClick={() => onUnmark(block)}>Desmarcar</Button>
          )}
        </>
      )}
    </Sheet>
  )
}

function AmountSheet({ open, onClose, free, onConfirm }: {
  open: boolean; onClose: () => void; free: number[]; onConfirm: (blocks: number[]) => void
}) {
  const [value, setValue] = useState<number | null>(null)
  const s = value ? suggestBlocks(free, value) : null
  const close = () => {
    setValue(null)
    onClose()
  }
  return (
    <Sheet open={open} onOpenChange={close} title="Quanto você guardou?">
      <form onSubmit={(e) => { e.preventDefault(); if (s?.blocks.length) { onConfirm(s.blocks); setValue(null) } }}>
        <CurrencyInput large autoFocus aria-label="Valor guardado" value={value} onChange={setValue} />
        {s && (
          <div className="mt-5">
            {s.blocks.length ? (
              <>
                <p className="mb-3">{s.blocks.length === 1 ? 'Marque este bloco:' : `Marque estes ${s.blocks.length} blocos:`}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {s.blocks.map((b) => (
                    <li key={b} className="num grid size-11 place-items-center rounded-block border-2 border-leaf bg-leaf/25 text-[0.8125rem] font-bold">{b}</li>
                  ))}
                </ul>
                {s.remainder > 0 && (
                  <p className="mt-3 text-sm text-muted">
                    Esses blocos somam {formatBRL(s.total)}. Os {formatBRL(s.remainder)} restantes ficam para o próximo depósito.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted">Nenhum bloco livre cabe nesse valor. Guarde um pouco mais e tente de novo.</p>
            )}
          </div>
        )}
        <Button type="submit" className="mt-6 w-full" disabled={!s?.blocks.length}>
          {s?.blocks.length ? `Marcar ${formatBRL(s.total)}` : 'Marcar blocos'}
        </Button>
      </form>
    </Sheet>
  )
}

function MenuSheet({ c, open, onClose, uid }: { c: ChallengeDetail; open: boolean; onClose: () => void; uid: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'list' | 'rename' | 'delete'>('list')
  const [title, setTitle] = useState(c.title)
  const owner = c.owner_id === uid
  const close = () => {
    setMode('list')
    onClose()
  }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: challengeKey(c.id) })
    qc.invalidateQueries({ queryKey: ['challenges', uid] })
  }
  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok: string, after?: () => void) => {
    const { error } = await fn()
    if (error) return toast('Não foi possível concluir. Tente de novo.', 'error')
    toast(ok)
    refresh()
    close()
    after?.()
  }

  return (
    <Sheet open={open} onOpenChange={close} title={mode === 'rename' ? 'Renomear desafio' : mode === 'delete' ? 'Excluir desafio?' : c.title}>
      {mode === 'list' && (
        <ul className="divide-y divide-line">
          {owner && <MenuItem onClick={() => setMode('rename')}>Renomear</MenuItem>}
          {c.type !== 'solo' && <li className="py-3">Código do convite: <strong className="num tracking-widest">{c.invite_code}</strong></li>}
          {owner && (
            <MenuItem onClick={() => run(() => supabase.rpc('archive_challenge', { p_id: c.id, p_archived: c.status !== 'archived' }),
              c.status === 'archived' ? 'Desafio reativado' : 'Desafio arquivado')}>
              {c.status === 'archived' ? 'Desarquivar' : 'Arquivar'}
            </MenuItem>
          )}
          {!owner && (
            <MenuItem onClick={() => run(() => supabase.from('challenge_members').delete().eq('challenge_id', c.id).eq('user_id', uid),
              'Você saiu do grupo', () => navigate('/app', { replace: true }))}>
              Sair do grupo
            </MenuItem>
          )}
          {owner && <MenuItem danger onClick={() => setMode('delete')}>Excluir</MenuItem>}
        </ul>
      )}
      {mode === 'rename' && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => supabase.rpc('rename_challenge', { p_id: c.id, p_title: title }), 'Nome atualizado') }}>
          <input autoFocus maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)}
            className="min-h-12 w-full rounded-field border-2 border-line bg-transparent px-3 outline-none focus:border-forest" />
          <Button type="submit" className="mt-4 w-full" disabled={!title.trim()}>Salvar nome</Button>
        </form>
      )}
      {mode === 'delete' && (
        <>
          <p>A grade e todas as marcações{c.members.length > 1 ? ' de todos os participantes' : ''} serão apagadas. Isso não tem volta.</p>
          <Button className="mt-6 w-full bg-danger" onClick={() => run(() => supabase.from('challenges').delete().eq('id', c.id),
            'Desafio excluído', () => navigate('/app', { replace: true }))}>
            Excluir desafio
          </Button>
          <Button variant="ghost" className="mt-1 w-full" onClick={() => setMode('list')}>Cancelar</Button>
        </>
      )}
    </Sheet>
  )
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={`min-h-12 w-full text-left font-semibold ${danger ? 'text-danger' : ''}`}>
        {children}
      </button>
    </li>
  )
}

/** Prévia do card de stories; a imagem é gerada ao abrir para o toque em "Compartilhar" já ter o arquivo pronto. */
function StorySheet({ open, onClose, data }: { open: boolean; onClose: () => void; data: StoryData }) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let url = ''
    let cancelled = false
    void import('./storyCard').then(({ renderStoryCard }) => renderStoryCard(data)).then((blob) => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setCard({ blob, url })
    }).catch(() => toast('Não foi possível gerar a imagem. Tente de novo.', 'error'))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      setCard(null)
    }
  }, [open]) // uma imagem por abertura; marcações novas entram na próxima

  async function share() {
    if (!card) return
    setBusy(true)
    const { shareStoryCard } = await import('./storyCard')
    const r = await shareStoryCard(card.blob, data.title)
    setBusy(false)
    if (r === 'canceled') return
    track('share_card', { via: r })
    if (r === 'downloaded') toast('Imagem salva. Poste nos seus stories.')
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={onClose} title="Compartilhar progresso">
      <div className="mx-auto aspect-[9/16] max-h-[55dvh] overflow-hidden rounded-field bg-forest">
        {card
          ? <img src={card.url} alt={`Card com ${formatBRL(data.saved)} guardados de ${formatBRL(data.goal)} no desafio ${data.title}`} className="size-full" />
          : <div className="size-full animate-pulse bg-forest/80" aria-hidden />}
      </div>
      <Button className="mt-5 w-full" disabled={!card || busy} onClick={share}>Compartilhar imagem</Button>
    </Sheet>
  )
}
