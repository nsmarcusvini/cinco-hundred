/** Guarda o evento de instalação do Chrome/Android: ele dispara cedo, antes da tela de Configurações abrir. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function captureInstallPrompt() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

/** Avisa quando o botão de instalar fica disponível (o evento pode chegar depois da tela abrir) ou o app é instalado. */
export function onInstallChange(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const canPromptInstall = () => deferred !== null
export const wasInstalled = () => installed
/** Rodando pelo ícone da tela de início (no iPhone, `navigator.standalone`). */
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}
