// Chamada pelo pg_cron a cada minuto (header x-cron-secret):
//  - sempre: processa a fila de eventos (amigo marcou/entrou, marco, acesso liberado);
//  - nos minutos 0/15/30/45: calcula os lembretes agendados no fuso de cada pessoa.
// Também aceita o JWT do usuário para "Enviar notificação de teste".
import webpush from 'npm:web-push@3.6.7'
import { admin, cors, json } from '../_shared/supabase.ts'
import { brl, inWindow, isPaydayToday, localTime, monthName, streak, type LocalTime } from '../_shared/schedule.ts'

webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

interface Message {
  kind: string
  title: string
  body: string
  url: string
  payload?: Record<string, unknown>
}

interface Profile {
  id: string
  timezone: string
  has_access: boolean
  reminder_enabled: boolean
  reminder_time: string
  reminder_days: number[]
}

// Fora do limite de 2 por dia (seção 7).
const UNCAPPED = new Set(['friend_joined', 'access_granted', 'test'])
const DAILY_CAP = 2

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const now = new Date()

  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret) {
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const { data: { user } } = await admin.auth.getUser(jwt)
    if (!user) return json({ error: 'unauthorized' }, 401)
    const delivered = await send(user.id, 'UTC', now, {
      kind: 'test', title: 'Cinco Hundred', body: 'Tudo certo! Seus lembretes vão chegar por aqui 🎉', url: '/app/config',
    })
    return json({ delivered })
  }

  const { data: ok } = await admin.rpc('check_cron_secret', { p_secret: cronSecret })
  if (!ok) return json({ error: 'unauthorized' }, 401)

  const queue = await processQueue(now)
  const scheduled = now.getUTCMinutes() % 15 === 0 ? await runScheduled(now) : 0
  return json({ queue, scheduled })
})

/** Envia para todas as inscrições da pessoa; remove as que expiraram (404/410). Retorna quantas receberam. */
async function send(userId: string, timeZone: string, now: Date, msg: Message): Promise<number> {
  if (!UNCAPPED.has(msg.kind)) {
    const t = localTime(now, timeZone)
    const midnight = new Date(now.getTime() - t.minutes * 60_000 - now.getUTCSeconds() * 1000)
    const { count } = await admin
      .from('notifications_log').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('sent_at', midnight.toISOString())
      .not('kind', 'in', `(${[...UNCAPPED].join(',')})`)
    if ((count ?? 0) >= DAILY_CAP) return 0
  }

  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
  let delivered = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.kind }),
        { TTL: 60 * 60 * 12 },
      )
      delivered++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
      else console.error('push failed', status, (e as Error).message)
    }
  }
  if (delivered) {
    await admin.from('notifications_log').insert({ user_id: userId, kind: msg.kind, payload: { ...msg.payload, body: msg.body } })
  }
  return delivered
}

async function timezones(ids: string[]): Promise<Map<string, string>> {
  const { data } = await admin.from('profiles').select('id, timezone').in('id', ids)
  return new Map((data ?? []).map((p) => [p.id, p.timezone]))
}

// ---------------------------------------------------------------- fila de eventos

interface QueueRow {
  id: number
  user_id: string
  kind: 'friend_marked' | 'friend_joined' | 'milestone' | 'access_granted'
  payload: { challenge_id?: string; title?: string; name?: string; amount?: number; pct?: number; group?: boolean }
}

async function processQueue(now: Date): Promise<number> {
  const { data } = await admin
    .from('notification_queue').select('id, user_id, kind, payload').is('processed_at', null).order('id').limit(500)
  const rows = (data ?? []) as QueueRow[]
  if (!rows.length) return 0
  // Marca antes de enviar: duas execuções sobrepostas não mandam em dobro.
  await admin.from('notification_queue').update({ processed_at: now.toISOString() }).in('id', rows.map((r) => r.id))

  // Agrupa por pessoa + tipo + desafio (+ marco): várias marcações viram um aviso só.
  const groups = new Map<string, QueueRow[]>()
  for (const r of rows) {
    const key = [r.user_id, r.kind, r.payload.challenge_id ?? '', r.payload.pct ?? ''].join('|')
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const tz = await timezones([...new Set(rows.map((r) => r.user_id))])

  let sent = 0
  for (const group of groups.values()) {
    const { user_id, kind, payload: p } = group[0]
    const url = p.challenge_id ? `/app/d/${p.challenge_id}` : '/app'
    let msg: Message
    if (kind === 'friend_marked') {
      // No máximo 1 aviso a cada 2 h por desafio.
      const { count } = await admin
        .from('notifications_log').select('id', { count: 'exact', head: true })
        .eq('user_id', user_id).eq('kind', 'friend_marked').eq('payload->>challenge_id', p.challenge_id!)
        .gte('sent_at', new Date(now.getTime() - 2 * 3600_000).toISOString())
      if (count) continue
      const names = [...new Set(group.map((r) => r.payload.name).filter(Boolean))].join(' e ') || 'Alguém do grupo'
      const amount = group.reduce((t, r) => t + (r.payload.amount ?? 0), 0)
      msg = { kind, title: p.title!, body: `${names} marcou ${brl(amount)} no ${p.title} 💪`, url }
    } else if (kind === 'friend_joined') {
      msg = { kind, title: p.title!, body: `${p.name} entrou no seu desafio 🤝`, url }
    } else if (kind === 'milestone') {
      const body = p.pct === 100
        ? `Desafio completo! ${p.group ? 'Vocês juntaram' : 'Você juntou'} tudo 🎉`
        : `${p.group ? 'Vocês chegaram' : 'Você chegou'} a ${p.pct}%! 🎉`
      msg = { kind, title: p.title!, body, url }
    } else {
      msg = { kind, title: 'Acesso liberado 🎉', body: 'Seu acesso vitalício está ativo. Bora criar seu desafio?', url: '/app/novo' }
    }
    msg.payload = { challenge_id: p.challenge_id }
    sent += await send(user_id, tz.get(user_id) ?? 'America/Sao_Paulo', now, msg)
  }
  return sent
}

// ---------------------------------------------------------------- lembretes agendados

async function runScheduled(now: Date): Promise<number> {
  const { data: subs } = await admin.from('push_subscriptions').select('user_id')
  const ids = [...new Set((subs ?? []).map((s) => s.user_id))]
  if (!ids.length) return 0
  const { data: profiles } = await admin
    .from('profiles').select('id, timezone, has_access, reminder_enabled, reminder_time, reminder_days').in('id', ids)

  let sent = 0
  for (const p of (profiles ?? []) as Profile[]) {
    for (const msg of await remindersFor(p, now)) sent += await send(p.id, p.timezone, now, msg)
  }
  sent += await movementsStarting(now)
  return sent
}

async function remindersFor(p: Profile, now: Date): Promise<Message[]> {
  if (!p.reminder_enabled) return []
  const t = localTime(now, p.timezone)
  const dailySlot = p.reminder_days.includes(t.dow) && inWindow(p.reminder_time, t.minutes)
  const nine = inWindow('09:00', t.minutes)
  const ten = inWindow('10:00', t.minutes)
  const night = inWindow('21:00', t.minutes)
  if (!dailySlot && !nine && !ten && !night) return []

  const { data: plan } = await admin
    .from('savings_plans').select('monthly_amount').eq('user_id', p.id).eq('is_active', true).maybeSingle()
  const monthly = plan ? Number(plan.monthly_amount) : 0

  if (!p.has_access) {
    // Grátis: só o "seu plano está esperando", no máximo 1 vez por semana.
    if (!dailySlot || !monthly) return []
    const { count } = await admin
      .from('notifications_log').select('id', { count: 'exact', head: true }).eq('user_id', p.id).eq('kind', 'plan_waiting')
      .gte('sent_at', new Date(now.getTime() - 7 * 86400_000).toISOString())
    if (count) return []
    return [{ kind: 'plan_waiting', title: 'Seu plano está esperando', body: `Guardar ${brl(monthly)} por mês te leva aos R$ 125.250. Bora começar?`, url: '/app/acesso' }]
  }

  const out: Message[] = []
  const { data: marks } = await admin
    .from('block_marks').select('block, marked_at, challenge_id').eq('user_id', p.id)
    .gte('marked_at', new Date(now.getTime() - 62 * 86400_000).toISOString())
  const markedAt = (marks ?? []).map((m) => m.marked_at as string)
  const markedToday = markedAt.some((m) => localTime(new Date(m), p.timezone).dateKey === t.dateKey)

  if (nine && monthly) {
    const { data: fp } = await admin.from('financial_profiles').select('paydays').eq('user_id', p.id).maybeSingle()
    const paydays: number[] = fp?.paydays ?? []
    if (paydays.length && isPaydayToday(t, paydays)) {
      out.push({ kind: 'payday', title: 'Dia do salário 💰', body: `Caiu o salário? Separe ${brl(monthly / paydays.length)} agora e marque seus blocos 💰`, url: '/app' })
    }
  }
  if (ten && monthly && t.day === 25) {
    const saved = savedThisMonth(marks ?? [], p.timezone, t)
    if (saved < monthly * 0.6) {
      out.push({ kind: 'month_risk', title: 'Meta do mês', body: `Faltam ${brl(monthly - saved)} para sua meta de ${monthName(t.month)}. Bora fechar o mês?`, url: '/app' })
    }
  }
  if (ten && monthly && t.day === 1) {
    out.push({ kind: 'checkin', title: 'Novo mês', body: `Novo mês, nova meta: ${brl(monthly)}. Algo mudou na sua renda?`, url: '/app/plano' })
  }
  if (dailySlot && !markedToday) {
    const draw = await drawBlock(p.id)
    if (draw) out.push({ kind: 'daily', title: 'Cinco Hundred', body: `Já guardou hoje? Seu bloco sorteado é o ${draw.block} 🎲`, url: `/app/d/${draw.challengeId}` })
  }
  if (night && !markedToday) {
    const days = streak(markedAt, p.timezone, now)
    if (days >= 3) out.push({ kind: 'streak_risk', title: 'Sequência em risco', body: `Não perca seus ${days} dias seguidos 🔥`, url: '/app' })
  }
  return out
}

function savedThisMonth(marks: { block: number; marked_at: string }[], tz: string, t: LocalTime) {
  return marks
    .filter((m) => { const l = localTime(new Date(m.marked_at), tz); return l.year === t.year && l.month === t.month })
    .reduce((s, m) => s + m.block, 0)
}

/** Bloco livre aleatório do desafio ativo mais recente da pessoa. */
async function drawBlock(userId: string): Promise<{ block: number; challengeId: string } | null> {
  const { data: member } = await admin
    .from('challenge_members').select('challenge_id, challenges!inner(blocks, status, created_at)')
    .eq('user_id', userId).eq('challenges.status', 'active')
    .order('created_at', { referencedTable: 'challenges', ascending: false }).limit(1).maybeSingle()
  if (!member) return null
  const blocks = (member.challenges as unknown as { blocks: number }).blocks
  const { data: marks } = await admin.from('block_marks').select('block').eq('challenge_id', member.challenge_id)
  const taken = new Set((marks ?? []).map((m) => m.block))
  const free: number[] = []
  for (let n = 1; n <= blocks; n++) if (!taken.has(n)) free.push(n)
  return free.length ? { block: free[Math.floor(Math.random() * free.length)], challengeId: member.challenge_id } : null
}

/** "O Desafio Janeiro começa amanhã" para quem já entrou, 24 h antes do início. */
async function movementsStarting(now: Date): Promise<number> {
  const from = new Date(now.getTime() + 24 * 3600_000)
  const to = new Date(from.getTime() + 15 * 60_000)
  const { data: movements } = await admin
    .from('movements').select('id, slug, title').eq('is_active', true)
    .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString())
  let sent = 0
  for (const m of movements ?? []) {
    const { data: members } = await admin
      .from('challenge_members').select('user_id, challenges!inner(movement_id)').eq('challenges.movement_id', m.id)
    const ids = [...new Set((members ?? []).map((x) => x.user_id))]
    const tz = await timezones(ids)
    for (const id of ids) {
      sent += await send(id, tz.get(id) ?? 'America/Sao_Paulo', now, {
        kind: 'movement_start', title: m.title, body: `O ${m.title} começa amanhã`, url: `/m/${m.slug}`,
      })
    }
  }
  return sent
}
