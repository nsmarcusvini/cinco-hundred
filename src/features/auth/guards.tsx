import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { readUtm } from '../../lib/utm'
import { supabase } from '../../lib/supabase'
import { useProfile } from '../../lib/queries'
import { useAuth } from './AuthProvider'

/** Exige login; sem sessão vai para /entrar e volta depois. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/entrar?next=${next}`} replace />
  }
  return <Outlet />
}

/**
 * 'ok', 'mfa' (falta a verificação em duas etapas) ou 'none'. Quem decide é o banco: isto só escolhe a tela.
 * Mesmo forçando esta rota, as RPCs do painel recusam quem não é admin.
 */
export function useAdminStatus() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['admin', 'status', session?.user.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_status')
      if (error) throw error
      return data as 'ok' | 'mfa' | 'none'
    },
    staleTime: 0,
    retry: false,
  })
}

/** Painel: sem 'ok' a pessoa nem vê que a rota existe, e o JS do painel não é baixado. */
export function RequireAdmin() {
  const { data: status, isPending } = useAdminStatus()
  if (isPending) return null
  if (status === 'mfa') return <Navigate to="/admin/verificacao" replace />
  if (status !== 'ok') return <Navigate to="/app" replace />
  return <Outlet />
}

/** Dentro de /app: manda para o onboarding enquanto ele não foi concluído. */
export function RequireOnboarding() {
  const { data: profile, isPending } = useProfile()

  // UTM da primeira visita vai para o profile uma vez.
  useEffect(() => {
    const utm = readUtm()
    if (profile && utm && !profile.utm_source) {
      void supabase.from('profiles').update(utm).eq('id', profile.id).then() // .then(): sem ele a consulta não é enviada
    }
  }, [profile])

  if (isPending) return null
  if (profile && !profile.onboarding_done) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
