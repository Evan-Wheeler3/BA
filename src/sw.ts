/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

// App shell, lessons and question bank are bundled into the precache, so the whole
// study experience works offline after the first visit.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA navigation fallback (deep links like /session work offline).
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

// Images/fonts: cache-first with expiry.
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({ cacheName: 'static-assets', plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 })] }),
)

// Supabase REST reads: network-first so fresh data wins, cached copy when offline.
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/'),
  new NetworkFirst({ cacheName: 'supabase-rest', networkTimeoutSeconds: 4 }),
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// ---- Push reminders ----
interface ReminderPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: ReminderPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  const title = data.title ?? 'BA study session'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? 'Time for tonight’s session.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag ?? 'ba-reminder',
      data: { url: data.url ?? '/session' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data?.url as string) ?? '/session', self.location.origin).href
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await (client as WindowClient).navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
