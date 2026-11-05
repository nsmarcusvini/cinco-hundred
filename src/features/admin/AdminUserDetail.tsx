import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Sheet } from '../../components/Sheet'
import { toast } from '../../components/Toast'
import { Button } from '../../components/ui'
import { useUserId } from '../auth/AuthProvider'
import { EVENT_LABEL, fmtAgo, fmtCents, fmtDate, fmtDateTime, setBan, setCourtesy, useUserDetail, type UserDetail } from './AdminApi'
import { Empty, LoadError, Loading, Section, Stat } from './AdminCharts'
import { AccessBadge } from './AdminUsers'

const GOAL_LABEL: Record<string, string> = {
  reserva: 'Reserva', investimento: 'Investimento', intercambio: 'Intercâmbio',
  dinheiro_trabalhando: 'Dinheiro trabalhando', outros: 'Outros',
}
const PLAN_LABEL = { monthly: 'mensal', annual: 'anual' }
const TYPE_LABEL = { solo: 'Individual', duo: 'Dupla', group: 'Grupo' }
const CHALLENGE_STATUS = { active: 'Ativo', completed: 'Concluído', archived: 'Arquivado' }
const PURCHASE_STATUS: Record<string, string> = {
  paid: 'Paga', pending: 'Pendente', failed: 'Falhou', expired: 'Expirada', refunded: 'Reembolsada', disputed: 'Contestada',
}
const SUBSCRIPTION_STATUS: Record<string, string> = {
  trialing: 'Em teste grátis', active: 'Ativa', past_due: 'Atrasada', unpaid: 'Sem pagamento', canceled: 'Cancelada',
  incomplete: 'Incompleta', incomplete_expired: 'Expirada', paused: 'Pausada',
}
const AUDIT_LABEL: Record<string, string> = {
  courtesy_on: 'Cortesia concedida', courtesy_off: 'Cortesia revogada', ban: 'Conta bloqueada', unban: 'Conta desbloqueada',
}

const yesNo = (v: boolean) => (v ? 'Sim' : 'Não')

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
      {rows.map(([term, value]) => (
        <div key={term} className="flex justify-between gap-4 border-b border-line py-1">
          <dt className="text-muted">{term}</dt>
          <dd className="m-0 min-w-0 text-right font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

type Pending = 'courtesy_on' | 'courtesy_off' | 'ban' | 'unban' | null

function Actions({ detail }: { detail: UserDetail }) {
  const { profile: p } = detail
  const me = useUserId()
  const qc = useQueryClient()
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const self = p.id === me

  async function confirm() {
    setBusy(true)
    try {
      if (pending === 'courtesy_on' || pending === 'courtesy_off') await setCourtesy(p.id, pending === 'courtesy_on')
      else await setBan(p.id, pending === 'ban')
      toast(COPY[pending!].done)
      await qc.invalidateQueries({ queryKey: ['admin'] })
      setPending(null)
    } catch (e) {
      toast(e instanceof Error && !e.message.startsWith('HTTP') ? e.message : 'Não foi possível concluir. Tente de novo.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const name = p.display_name || p.email || 'esta pessoa'
  const COPY = {
    courtesy_on: {
      title: 'Conceder cortesia?', action: 'Conceder cortesia', done: 'Cortesia concedida',
      body: `${name} passa a ter acesso sem pagar, até você revogar. Não gera cobrança nem conta como pagante.`,
    },
    courtesy_off: {
      title: 'Revogar cortesia?', action: 'Revogar cortesia', done: 'Cortesia revogada',
      body: `${name} perde o acesso agora, se não tiver outro pagamento ativo. Os desafios continuam visíveis, mas sem marcar nem desmarcar blocos.`,
    },
    ban: {
      title: 'Bloquear conta?', action: 'Bloquear conta', done: 'Conta bloqueada',
      body: `${name} não consegue mais entrar. Uma sessão já aberta pode durar até 1 hora. Bloquear não cancela assinatura: se houver uma ativa, a cobrança continua até ser cancelada na Stripe.`,
    },
    unban: {
      title: 'Desbloquear conta?', action: 'Desbloquear conta', done: 'Conta desbloqueada',
      body: `${name} volta a conseguir entrar.`,
    },
  }
  const open = pending ?? 'ban'

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {p.access === 'cortesia' && <Button variant="secondary" onClick={() => setPending('courtesy_off')}>Revogar cortesia</Button>}
        {!p.has_access && <Button variant="secondary" onClick={() => setPending('courtesy_on')}>Conceder cortesia</Button>}
        {!self && !p.is_admin && (
          <Button variant="secondary" onClick={() => setPending(p.banned ? 'unban' : 'ban')}>
            {p.banned ? 'Desbloquear conta' : 'Bloquear conta'}
          </Button>
        )}
      </div>
      <Sheet open={pending !== null} onOpenChange={(o) => !o && !busy && setPending(null)} title={COPY[open].title}>
        <p>{COPY[open].body}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void confirm()}>{busy ? 'Salvando…' : COPY[open].action}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancelar</Button>
        </div>
      </Sheet>
    </>
  )
}

export default function AdminUserDetail() {
  const { id = '' } = useParams()
  const { data, isPending, isError, refetch } = useUserDetail(id)

  return (
    <>
      <Link to="/admin/usuarios" className="text-xs text-forest underline-offset-4 hover:underline">Voltar para usuários</Link>
      {isPending ? <Loading /> : isError ? <LoadError onRetry={() => void refetch()} /> : <Detail data={data} />}
    </>
  )
}

function Detail({ data }: { data: UserDetail }) {
  const { profile: p, subscription: sub, purchases, challenges, events, audit } = data
  const marked = challenges.reduce((sum, c) => sum + c.marked_by_user, 0)

  return (
    <>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold break-words">{p.display_name || p.email || 'Sem nome'}</h1>
          <p className="break-all text-muted">{p.email}</p>
          <p className="mt-1 flex flex-wrap gap-x-4">
            <AccessBadge access={p.access} />
            {p.banned && <strong className="text-danger">Conta bloqueada</strong>}
            {p.is_admin && <strong>Admin</strong>}
          </p>
        </div>
        <Actions detail={data} />
      </div>

      <div className="mt-6 flex flex-wrap gap-x-12 gap-y-6">
        <Stat value={fmtAgo(p.last_seen_at)} label="Último acesso" />
        <Stat value={challenges.length} label={challenges.length === 1 ? 'Desafio' : 'Desafios'} />
        <Stat value={marked} label="Blocos marcados" />
        <Stat value={p.views_30d} label="Telas abertas em 30 dias" />
      </div>

      <Section title="Cadastro">
        <Facts rows={[
          ['Cadastro em', fmtDateTime(p.created_at)],
          ['E-mail confirmado', yesNo(p.email_confirmed)],
          ['Último login', fmtDateTime(p.last_sign_in_at)],
          ['Último acesso', fmtDateTime(p.last_seen_at)],
          ['Cidade', [p.city, p.state].filter(Boolean).join(', ') || 'Não informou'],
          ['Idade', p.age ?? 'Não informou'],
          ['Origem', [p.utm_source, p.utm_campaign].filter(Boolean).join(', ') || 'Direto'],
          ['Vai guardar', p.saving_with === 'junto' ? 'Com alguém' : p.saving_with === 'sozinho' ? 'Sozinho(a)' : 'Não respondeu'],
          ['Objetivo', (p.savings_goal && GOAL_LABEL[p.savings_goal]) || 'Não respondeu'],
          ['Onboarding', p.onboarding_done ? 'Concluído' : `Parou no passo ${p.onboarding_step}`],
          ['Tutorial visto', yesNo(p.tour_done)],
          ['Tem plano', yesNo(p.has_plan)],
          ['Lembretes', p.reminder_enabled ? 'Ligados' : 'Desligados'],
          ['Push neste aparelho', yesNo(p.push_enabled)],
          ['Aceita novidades por e-mail', yesNo(p.marketing_opt_in)],
          ['Nos rankings', p.show_in_global_ranking ? 'Geral e movimentos' : p.show_in_rankings ? 'Só movimentos' : 'Em nenhum'],
        ]} />
        <p className="mt-3 text-xs text-muted">Renda, gastos, plano e valores guardados não aparecem no painel.</p>
      </Section>

      <Section title="Acesso e pagamento">
        <Facts rows={[
          ['Acesso liberado', p.has_access ? `Sim, desde ${fmtDate(p.access_granted_at)}` : 'Não'],
          ...(sub ? ([
            ['Assinatura', `${SUBSCRIPTION_STATUS[sub.status] ?? sub.status}${sub.plan ? `, plano ${PLAN_LABEL[sub.plan]}` : ''}`],
            ...(sub.trial_end ? [['Fim do teste grátis', fmtDate(sub.trial_end)]] : []),
            ...(sub.current_period_end ? [['Período atual até', fmtDate(sub.current_period_end)]] : []),
            ...(sub.cancel_at ? [['Cancelada, acesso até', fmtDate(sub.cancel_at)]] : []),
            ...(sub.stripe_customer_id ? [['Cliente na Stripe', sub.stripe_customer_id]] : []),
          ] as [string, ReactNode][]) : []),
        ]} />
        {purchases.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="text-xs text-muted">
                <tr className="border-b-2 border-ink/70">
                  <th scope="col" className="py-2 pr-4 font-normal">Compra</th>
                  <th scope="col" className="py-2 pr-4 font-normal">Situação</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">Valor</th>
                  <th scope="col" className="py-2 font-normal">Cupom</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((x) => (
                  <tr key={x.created_at} className="border-b border-line">
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(x.created_at)}</td>
                    <td className="py-2 pr-4">{x.courtesy ? 'Cortesia' : PURCHASE_STATUS[x.status] ?? x.status}</td>
                    <td className="num py-2 pr-4 text-right">{fmtCents(x.amount, x.currency)}</td>
                    <td className="py-2">{x.promotion_code ?? 'Nenhum'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Desafios" hint="Progresso em blocos marcados. O percentual em dinheiro não aparece aqui porque revelaria quanto a pessoa guardou.">
        {challenges.length === 0 ? <Empty>Ainda não criou nem entrou em nenhum desafio.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="text-xs text-muted">
                <tr className="border-b-2 border-ink/70">
                  <th scope="col" className="py-2 pr-4 font-normal">Desafio</th>
                  <th scope="col" className="py-2 pr-4 font-normal">Tipo</th>
                  <th scope="col" className="py-2 pr-4 font-normal">Situação</th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">Blocos</th>
                  <th scope="col" className="py-2 font-normal">Último bloco</th>
                </tr>
              </thead>
              <tbody>
                {challenges.map((c) => (
                  <tr key={c.id} className="border-b border-line">
                    <td className="max-w-[260px] truncate py-2 pr-4 font-medium">{c.title}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {TYPE_LABEL[c.type]}{c.type !== 'solo' && `, ${c.members} pessoas`}{c.role === 'member' && ' (por convite)'}
                    </td>
                    <td className="py-2 pr-4">{CHALLENGE_STATUS[c.status]}</td>
                    <td className="num py-2 pr-4 text-right whitespace-nowrap">
                      {c.marked_total} de {c.blocks}
                      {c.type !== 'solo' && <span className="block text-xs text-muted">{c.marked_by_user} desta pessoa</span>}
                    </td>
                    <td className="py-2 whitespace-nowrap">{fmtAgo(c.last_mark_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Últimas ações" hint="Nome e data de cada ação, sem detalhes. Telas abertas ficam de fora para a lista não virar ruído.">
        {events.length === 0 ? <Empty>Nenhuma ação registrada.</Empty> : (
          <ul className="max-w-[560px]">
            {events.map((e, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-line py-1.5">
                <span>{EVENT_LABEL[e.name] ?? e.name}</span>
                <span className="text-xs whitespace-nowrap text-muted">{fmtDateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {audit.length > 0 && (
        <Section title="O que você fez nesta conta">
          <ul className="max-w-[560px]">
            {audit.map((a, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-line py-1.5">
                <span>{AUDIT_LABEL[a.action] ?? a.action}</span>
                <span className="text-xs whitespace-nowrap text-muted">{fmtDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}
