import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { StrictMode, useEffect, useRef } from 'react'
import { RouterProvider } from 'react-router'
import { Toaster } from '../components/Toast'
import { AuthProvider, useAuth } from '../features/auth/AuthProvider'
import { registerBlockMutations } from '../features/challenges/mutations'
import { router } from './router'

const queryClient = new QueryClient({
  // gcTime alto para o cache persistido (24h) não ser descartado antes de ir para o disco.
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 24 * 60 * 60 * 1000 } },
})
registerBlockMutations(queryClient)

/** Liga o cache offline (IndexedDB) para a conta logada. Carregado depois da primeira tela, fora do bundle inicial. */
function OfflineCache() {
  const qc = useQueryClient()
  const { session, loading } = useAuth()
  const uid = session?.user.id
  const hadUser = useRef(false)
  useEffect(() => {
    if (loading) return
    const signedOut = hadUser.current && !uid
    hadUser.current = !!uid
    if (!uid && !signedOut) return
    let stop = () => {}
    let cancelled = false
    void import('../lib/offline').then(({ startPersistence, clearPersisted }) => {
      if (cancelled) return
      if (uid) stop = startPersistence(qc, uid)
      else {
        // Saiu da conta: nada do usuário fica neste aparelho.
        qc.clear()
        void clearPersisted()
      }
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [qc, uid, loading])
  return null
}

export default function App() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OfflineCache />
          <RouterProvider router={router} />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
