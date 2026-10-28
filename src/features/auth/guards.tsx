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

/** Dentro de /app: manda para o onboarding enquanto ele não foi concluído. */
export function RequireOnboarding() {
  const { data: profile, isPending } = useProfile()

  // UTM da primeira visita vai para o profile uma vez.
  useEffect(() => {
    const utm = readUtm()
    if (profile && utm && !profile.utm_source) {
      void supabase.from('profiles').update(utm).eq('id', profile.id)
    }
  }, [profile])

  if (isPending) return null
  if (profile && !profile.onboarding_done) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
