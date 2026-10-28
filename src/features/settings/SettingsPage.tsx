import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Sheet } from '../../components/Sheet'
import { toast } from '../../components/Toast'
import { Button, Choice } from '../../components/ui'
import { formatBRL } from '../../lib/format'
import { GOALS, type SavingsGoal } from '../../lib/goals'
import { canPromptInstall, isStandalone, promptInstall } from '../../lib/install'
import { enablePush, isIosBrowser, PUSH_MESSAGES } from '../../lib/push'
import { useProfile, type Profile } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { useUserId } from '../auth/AuthProvider'

const DAYS = [
  { value: 1, label: 'S' }, { value: 2, label: 'T' }, { value: 3, label: 'Q' }, { value: 4, label: 'Q' },
  { value: 5, label: 'S' }, { value: 6, label: 'S' }, { value: 0, label: 'D' },
]
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const inputCls = 'w-full min-h-12 rounded-field border-2 border-line bg-transparent px-3 outline-none focus:border-forest'
const dateBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur()

/** /app/config */
export default function SettingsPage() {
  const { data: profile } = useProfile()
  if (!profile) return null
  return (
    <div className="space-y-10 py-6">
      <h1 className="text-xl font-bold">Configurações</h1>
      <ProfileSection profile={profile} />
      <Reminders profile={profile} />
      <Finances />
      <Access profile={profile} />
      <InstallSection />
      <Privacy profile={profile} />
      <Section title="Ajuda">
        <Link to="/app?tutorial" className="inline-flex min-h-12 items-center rounded-field border-2 border-forest px-5 font-semibold text-forest">
          Ver o tutorial de novo
        </Link>
      </Section>
      <Account profile={profile} />
      <nav className="flex gap-5 text-sm text-muted">
        <Link to="/termos" className="underline underline-offset-4">Termos de uso</Link>
        <Link to="/privacidade" className="underline underline-offset-4">Política de privacidade</Link>
      </nav>
    </div>
  )
}

/** Atualiza o profile na hora (otimista) e salva em segundo plano. */
function useProfileUpdate() {
  const uid = useUserId()
  const qc = useQueryClient()
  return async (patch: Partial<Profile>) => {
    const key = ['profile', uid]
    const prev = qc.getQueryData<Profile>(key)
    qc.setQueryData<Profile>(key, (p) => p && { ...p, ...patch })
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid)
    if (error) {
      qc.setQueryData(key, prev)
      toast('Não foi possível salvar. Tente de novo.', 'error')
    }
  }
}

function ProfileSection({ profile }: { profile: Profile }) {
  const update = useProfileUpdate()
  const [name, setName] = useState(profile.display_name ?? '')
  const [other, setOther] = useState(profile.savings_goal_other ?? '')

  function saveName() {
    const v = name.trim()
    if (!v) return setName(profile.display_name ?? '')
    if (v !== profile.display_name) void update({ display_name: v })
  }
  function pickGoal(goal: SavingsGoal) {
    void update({ savings_goal: goal, savings_goal_other: goal === 'outros' ? other.trim() || null : null })
  }
  function saveOther() {
    const v = other.trim() || null
    if (v !== profile.savings_goal_other) void update({ savings_goal_other: v })
  }

  return (
    <Section title="Perfil">
      <label className="block">
        <span className="mb-1 block">Como quer ser chamado(a)</span>
        <input maxLength={40} className={inputCls} value={name} onChange={(e) => setName(e.target.value)}
          onBlur={saveName} onKeyDown={blurOnEnter} />
      </label>
      <p className="mt-1 text-xs text-muted">Nos desafios em grupo em que você já entrou, fica o nome que você usou ao entrar.</p>
      <div className="mt-5">
        <p className="mb-2">Para que você está juntando</p>
        <Choice<SavingsGoal> label="Objetivo" value={profile.savings_goal} onChange={pickGoal}
          options={GOALS.map((g) => ({ value: g.value, label: <><span aria-hidden>{g.icon}</span> {g.label}</> }))} />
        {profile.savings_goal === 'outros' && (
          <input maxLength={40} placeholder="Ex.: comprar um carro, casamento, abrir um negócio" aria-label="Qual é o seu objetivo?"
            className={`${inputCls} mt-3`} value={other} onChange={(e) => setOther(e.target.value)}
            onBlur={saveOther} onKeyDown={blurOnEnter} />
        )}
      </div>
    </Section>
  )
}

function Reminders({ profile }: { profile: Profile }) {
  const uid = useUserId()
  const update = useProfileUpdate()
  const [busy, setBusy] = useState(false)

  async function activate() {
    setBusy(true)
    const r = await enablePush(uid)
    setBusy(false)
    toast(r === 'granted' ? 'Notificações ativadas neste aparelho.' : PUSH_MESSAGES[r], r === 'granted' ? 'info' : 'error')
  }

  async function test() {
    setBusy(true)
    const r = await enablePush(uid)
    if (r !== 'granted') {
      setBusy(false)
      return toast(PUSH_MESSAGES[r], 'error')
    }
    const { data, error } = await supabase.functions.invoke('send-notifications', { body: {} })
    setBusy(false)
    if (error || !data?.delivered) return toast('A notificação de teste não foi entregue. Tente de novo.', 'error')
    toast('Notificação de teste enviada.')
  }

  return (
    <Section title="Lembretes">
      <Toggle label="Receber lembretes" checked={profile.reminder_enabled} onChange={(v) => update({ reminder_enabled: v })} />
      {profile.reminder_enabled && (
        <>
          <label className="mt-4 flex items-center justify-between gap-4">
            <span>Horário do lembrete diário</span>
            <input type="time" step={900} value={profile.reminder_time.slice(0, 5)}
              onChange={(e) => e.target.value && update({ reminder_time: e.target.value })}
              className="min-h-11 rounded-field border-2 border-line bg-transparent px-3" />
          </label>
          <div className="mt-4">
            <p className="mb-2">Dias</p>
            <div className="flex gap-1.5">
              {DAYS.map((d) => {
                const on = profile.reminder_days.includes(d.value)
                return (
                  <button key={d.value} type="button" aria-pressed={on} aria-label={DAY_NAMES[d.value]}
                    onClick={() => update({ reminder_days: on ? profile.reminder_days.filter((x) => x !== d.value) : [...profile.reminder_days, d.value] })}
                    className={`size-11 rounded-block font-bold ${on ? 'bg-forest text-cream' : 'border-2 border-line'}`}>
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-4 text-sm text-muted">
            No dia do salário avisamos às 9h para separar o valor do seu plano. Às 21h, se a sequência estiver em risco.
          </p>
        </>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={activate}>Ativar neste aparelho</Button>
        <Button variant="ghost" disabled={busy} onClick={test}>Enviar notificação de teste</Button>
      </div>
    </Section>
  )
}

interface PastPlan { id: string; monthly_amount: number; created_at: string }

function Finances() {
  const uid = useUserId()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data: past } = useQuery({
    queryKey: ['past-plans', uid],
    queryFn: async () => {
      const { data, error } = await supabase.from('savings_plans').select('id, monthly_amount, created_at')
        .eq('user_id', uid).eq('is_active', false).order('created_at', { ascending: false }).limit(12)
      if (error) throw error
      return data as PastPlan[]
    },
  })

  async function wipe() {
    setBusy(true)
    const results = await Promise.all([
      supabase.from('expenses').delete().eq('user_id', uid),
      supabase.from('financial_profiles').delete().eq('user_id', uid),
      supabase.from('savings_plans').update({ inputs_snapshot: null }).eq('user_id', uid),
    ])
    setBusy(false)
    setConfirm(false)
    if (results.some((r) => r.error)) return toast('Não foi possível apagar tudo. Tente de novo.', 'error')
    await qc.invalidateQueries({ queryKey: ['plan', uid] })
    toast('Renda e gastos apagados.')
  }

  return (
    <Section title="Minhas finanças">
      <div className="flex flex-wrap gap-2">
        <Link to="/onboarding?refazer" className="inline-flex min-h-12 items-center rounded-field bg-forest px-5 font-semibold text-cream">
          Refazer plano
        </Link>
        <Link to="/app/plano" className="inline-flex min-h-12 items-center rounded-field border-2 border-forest px-5 font-semibold text-forest">
          Ver meu plano
        </Link>
      </div>
      {!!past?.length && (
        <div className="mt-5">
          <p className="mb-1">Planos anteriores</p>
          <ul className="divide-y divide-line">
            {past.map((p) => (
              <li key={p.id} className="flex justify-between gap-4 py-2 text-sm">
                <span>{dateBR(p.created_at)}</span>
                <span className="num font-semibold">{formatBRL(Number(p.monthly_amount))} por mês</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button variant="ghost" className="mt-3 -ml-5 text-danger" onClick={() => setConfirm(true)}>Apagar renda e gastos</Button>
      <Sheet open={confirm} onOpenChange={setConfirm} title="Apagar renda e gastos?">
        <p>Apagamos sua renda, seus gastos e o resumo financeiro dos seus planos. O valor por mês e seus desafios continuam.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button className="bg-danger" disabled={busy} onClick={wipe}>{busy ? 'Apagando…' : 'Apagar renda e gastos'}</Button>
          <Button variant="secondary" onClick={() => setConfirm(false)}>Cancelar</Button>
        </div>
      </Sheet>
    </Section>
  )
}

function Access({ profile }: { profile: Profile }) {
  const uid = useUserId()
  const { data: receipt } = useQuery({
    queryKey: ['receipt', uid],
    enabled: profile.has_access,
    queryFn: async () => {
      const { data } = await supabase.from('purchases').select('receipt_url')
        .eq('user_id', uid).eq('status', 'paid').order('created_at', { ascending: false }).limit(1).maybeSingle()
      return (data?.receipt_url as string | null) ?? null
    },
  })
  return (
    <Section title="Acesso">
      {profile.has_access ? (
        <>
          <p>Acesso vitalício{profile.access_granted_at && <> desde {dateBR(profile.access_granted_at)}</>}.</p>
          {receipt && (
            <a href={receipt} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-forest underline underline-offset-4">
              Ver recibo
            </a>
          )}
        </>
      ) : (
        <>
          <p className="text-muted">Você já monta o plano. Para criar desafios, libere o acesso vitalício.</p>
          <Link to="/app/acesso" className="mt-3 inline-flex min-h-12 items-center rounded-field bg-forest px-5 font-semibold text-cream">
            Liberar acesso
          </Link>
        </>
      )}
    </Section>
  )
}

function InstallSection() {
  const [installed, setInstalled] = useState(isStandalone)
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)

  async function install() {
    const ok = await promptInstall()
    setCanPrompt(false)
    if (ok) setInstalled(true)
  }

  return (
    <Section title="App">
      {installed ? (
        <p>O Tijoblock já está instalado neste aparelho.</p>
      ) : canPrompt ? (
        <>
          <p className="mb-3 text-muted">Instale para abrir direto da tela de início e receber os lembretes.</p>
          <Button onClick={install}>Instalar o app</Button>
        </>
      ) : isIosBrowser() ? (
        <ol className="list-decimal space-y-1 pl-5">
          <li>Toque em Compartilhar, na barra do Safari.</li>
          <li>Escolha Adicionar à Tela de Início.</li>
          <li>Abra o Tijoblock pelo ícone novo.</li>
        </ol>
      ) : (
        <p className="text-muted">Para instalar, abra o menu do navegador e escolha Instalar app ou Adicionar à tela inicial.</p>
      )}
    </Section>
  )
}

function Privacy({ profile }: { profile: Profile }) {
  const update = useProfileUpdate()
  return (
    <Section title="Privacidade">
      <Toggle label="Aparecer no ranking geral" hint="Seu nome e o total que você marcou nos blocos."
        checked={profile.show_in_global_ranking} onChange={(v) => update({ show_in_global_ranking: v })} />
      <Toggle label="Aparecer nos rankings dos movimentos" hint="Só o seu nome e a % aparecem, nunca valores."
        checked={profile.show_in_rankings} onChange={(v) => update({ show_in_rankings: v })} />
      <Toggle label="Receber novidades por e-mail" checked={profile.marketing_opt_in} onChange={(v) => update({ marketing_opt_in: v })} />
    </Section>
  )
}

function Account({ profile }: { profile: Profile }) {
  const uid = useUserId()
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  async function exportData() {
    setExporting(true)
    const own = (table: string, col = 'user_id') => supabase.from(table).select('*').eq(col, uid)
    const entries = Object.entries({
      profile: own('profiles', 'id'), financial_profile: own('financial_profiles'), expenses: own('expenses'),
      savings_plans: own('savings_plans'), purchases: own('purchases'),
      challenge_members: own('challenge_members'), block_marks: own('block_marks'),
    })
    const results = await Promise.all(entries.map(([, q]) => q))
    setExporting(false)
    if (results.some((r) => r.error)) return toast('Não foi possível exportar. Tente de novo.', 'error')
    const data = Object.fromEntries(entries.map(([k], i) => [k, results[i].data]))
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'tijoblock-meus-dados.json' })
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.functions.invoke('delete-account', { body: {} })
    if (error) {
      setBusy(false)
      return toast('Não foi possível excluir a conta. Tente de novo.', 'error')
    }
    await supabase.auth.signOut({ scope: 'local' })
    location.replace('/')
  }

  return (
    <Section title="Conta">
      {profile.email && <p className="mb-4 text-muted">Você entrou com {profile.email}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => supabase.auth.signOut()}>Sair</Button>
        <Button variant="secondary" disabled={exporting} onClick={exportData}>{exporting ? 'Exportando…' : 'Exportar meus dados'}</Button>
      </div>
      <Button variant="ghost" className="mt-3 -ml-5 text-danger" onClick={() => setDeleting(true)}>Excluir conta</Button>
      <Sheet open={deleting} onOpenChange={(o) => { setDeleting(o); setTyped('') }} title="Excluir sua conta?">
        <form onSubmit={deleteAccount}>
          <p>
            Apagamos seu perfil, plano, finanças e marcações. Nos desafios em grupo que você criou, outra pessoa do grupo
            passa a ser a dona. Não dá para desfazer.
          </p>
          <label htmlFor="confirm-delete" className="mt-5 mb-1 block">Digite EXCLUIR para confirmar</label>
          <input id="confirm-delete" autoComplete="off" autoCapitalize="characters" className={inputCls}
            value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} />
          <Button type="submit" className="mt-6 w-full bg-danger" disabled={busy || typed !== 'EXCLUIR'}>
            {busy ? 'Excluindo…' : 'Excluir minha conta'}
          </Button>
        </form>
      </Sheet>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only" />
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-forest peer-focus-visible:outline-3 peer-focus-visible:outline-gold after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-cream after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  )
}
