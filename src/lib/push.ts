import { track } from './analytics'
import { supabase } from './supabase'

export type PushResult = 'granted' | 'denied' | 'unsupported' | 'ios_install' | 'error'

/** iPhone só recebe push com o app adicionado à tela de início (iOS 16.4+). */
export const isIosBrowser = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches

/** Pede permissão (só quando a pessoa toca no botão) e guarda a inscrição no banco. */
export async function enablePush(userId: string): Promise<PushResult> {
  if (isIosBrowser()) return 'ios_install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64Url(import.meta.env.VITE_VAPID_PUBLIC_KEY) }))
    const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent },
      { onConflict: 'endpoint' },
    )
    if (error) throw error
    track('push_enabled')
    return 'granted'
  } catch {
    return 'error'
  }
}

function base64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

export const PUSH_MESSAGES: Record<Exclude<PushResult, 'granted'>, string> = {
  denied: 'As notificações estão bloqueadas. Libere nas configurações do navegador para receber os lembretes.',
  unsupported: 'Este navegador não recebe notificações. Tente pelo Chrome no Android ou instale o app.',
  ios_install: 'No iPhone, adicione o app à tela de início (Compartilhar > Adicionar à Tela de Início) e ative por lá.',
  error: 'Não foi possível ativar as notificações agora. Tente de novo.',
}
