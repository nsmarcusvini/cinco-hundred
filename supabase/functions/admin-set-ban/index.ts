// Bloqueia ou desbloqueia uma conta. Só admin com verificação em duas etapas: quem confere é admin_status, chamada com o
// JWT de quem pediu, a mesma regra de todas as RPCs do painel. O Auth só tem esta operação pela API de admin.
// Bloquear impede novos logins e renovações de sessão; a sessão aberta dura até o token vencer (até 1h).
// Não cancela assinatura: a cobrança continua até alguém cancelar na Stripe.
import { admin, cors, json } from '../_shared/supabase.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FOREVER = '876000h' // o Auth pede uma duração: 100 anos

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authorization = req.headers.get('Authorization') ?? ''
  const { data: { user } } = await admin.auth.getUser(authorization.replace('Bearer ', ''))
  if (!user) return json({ error: 'unauthorized' }, 401)

  const status = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/admin_status`, {
    method: 'POST',
    headers: { apikey: req.headers.get('apikey') ?? '', Authorization: authorization, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!status.ok || (await status.json()) !== 'ok') return json({ error: 'forbidden' }, 403)

  const body = await req.json().catch(() => null)
  const userId = body?.user_id
  if (typeof userId !== 'string' || !UUID.test(userId) || typeof body?.banned !== 'boolean') {
    return json({ error: 'invalid_request' }, 400)
  }
  if (userId === user.id) return json({ error: 'cannot_ban_self' }, 400)

  const { data: target } = await admin.from('admins').select('user_id').eq('user_id', userId).maybeSingle()
  if (target) return json({ error: 'cannot_ban_admin' }, 400)

  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: body.banned ? FOREVER : 'none' })
  if (error) return json({ error: 'update_failed' }, 500)

  const { error: auditError } = await admin.from('admin_audit_log').insert({
    admin_id: user.id, action: body.banned ? 'ban' : 'unban', target_user_id: userId,
  })
  if (auditError) console.error('audit', auditError)
  return json({ banned: body.banned })
})
