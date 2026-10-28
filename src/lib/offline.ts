import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import type { QueryClient } from '@tanstack/react-query'
import { del, get, set } from 'idb-keyval'

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000
// Suba quando o formato de algum dado em cache mudar: o cache antigo é descartado.
const CACHE_VERSION = 2

const persister = createAsyncStoragePersister({
  storage: { getItem: get<string>, setItem: set, removeItem: del },
  key: 'ch.cache',
  throttleTime: 300, // marcação offline vai para o disco quase na hora
})

/**
 * Guarda o cache e as marcações pendentes no IndexedDB. O `buster` é o id do usuário:
 * um cache salvo por outra conta neste aparelho é descartado ao restaurar.
 * Depois de restaurar, envia o que ficou na fila (se houver internet).
 */
export function startPersistence(qc: QueryClient, userId: string) {
  const [unsubscribe, restored] = persistQueryClient({
    queryClient: qc, persister, buster: `${CACHE_VERSION}:${userId}`, maxAge: PERSIST_MAX_AGE,
  })
  void restored.then(() => qc.resumePausedMutations())
  return unsubscribe
}

export const clearPersisted = () => persister.removeClient()
