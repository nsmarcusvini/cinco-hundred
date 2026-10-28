/** Guarda o evento de instalação do Chrome/Android: ele dispara cedo, antes da tela de Configurações abrir. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null

export function captureInstallPrompt() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
  })
  addEventListener('appinstalled', () => (deferred = null))
}

export const canPromptInstall = () => deferred !== null
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  return outcome === 'accepted'
}
