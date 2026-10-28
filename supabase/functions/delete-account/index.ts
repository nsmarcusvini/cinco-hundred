// Exclui a conta de quem chama (JWT obrigatório). Antes, passa os desafios em grupo que a pessoa criou
// para o membro mais antigo, para o grupo não sumir junto. O resto sai em cascata pelas FKs;
// compras ficam (user_id vira null) por obrigação contábil.
import { admin, cors, json } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const { data: owned, error } = await admin.from('challenges').select('id').eq('owner_id', user.id)
  if (error) return json({ error: 'lookup_failed' }, 500)

  for (const { id } of owned ?? []) {
    const { data: heir } = await admin.from('challenge_members').select('user_id')
      .eq('challenge_id', id).neq('user_id', user.id).order('joined_at').limit(1).maybeSingle()
    if (!heir) continue // solo: some junto com a conta
    const moved = await admin.from('challenges').update({ owner_id: heir.user_id }).eq('id', id)
    const role = await admin.from('challenge_members').update({ role: 'owner' }).eq('challenge_id', id).eq('user_id', heir.user_id)
    if (moved.error || role.error) return json({ error: 'transfer_failed' }, 500)
  }

  const { error: delError } = await admin.auth.admin.deleteUser(user.id)
  if (delError) return json({ error: 'delete_failed' }, 500)
  return json({ deleted: true })
})
