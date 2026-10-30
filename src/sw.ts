/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

// Versão nova assume na hora, sem esperar todas as janelas fecharem (no PWA instalado isso quase nunca acontece).
// Ao assumir, o registerSW (autoUpdate, src/main.tsx) recarrega a página aberta.
self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
// Abre offline: toda navegação cai no index.html do cache. Em dev não há precache (e isso quebraria o SW).
if (import.meta.env.PROD) registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  const data: PushPayload = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Tijoblock', {
      body: data.body,
      icon: '/pwa-192x192.png',
      tag: data.tag,
      data: { url: data.url ?? '/app' },
    }),
  )
})

// Tocar na notificação abre a tela certa (reaproveita a janela do app se já estiver aberta).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/app'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows[0]
      if (open) {
        await open.navigate(url)
        return open.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
