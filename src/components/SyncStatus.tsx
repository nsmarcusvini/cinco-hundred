import { onlineManager, useIsMutating, useMutationState } from '@tanstack/react-query'
import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * Faixa abaixo do cabeçalho: sem internet (com quantas marcações esperam) e, ao voltar,
 * "sincronizando" até a fila esvaziar. Envios normais com internet não mostram nada.
 */
export function SyncStatus() {
  const online = useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline())
  const waiting = useMutationState({ filters: { predicate: (m) => m.state.isPaused } }).length
  const pending = useIsMutating()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!online && waiting > 0) setSyncing(true)
    else if (online && pending === 0) setSyncing(false)
  }, [online, waiting, pending])

  if (online && !syncing) return null
  const text = !online
    ? waiting > 0
      ? `Sem internet. ${waiting === 1 ? '1 marcação espera' : `${waiting} marcações esperam`} a conexão voltar.`
      : 'Sem internet. O que você marcar fica guardado e sobe quando a conexão voltar.'
    : 'Sincronizando suas marcações…'
  return (
    <p role="status" className={`px-4 py-2 text-center text-sm font-semibold ${online ? 'bg-leaf text-cream' : 'bg-gold text-forest'}`}>
      {text}
    </p>
  )
}
