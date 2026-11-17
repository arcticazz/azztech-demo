// Network-first cache so the demo still opens with poor signal. Scoped to this subpath only.
const CACHE = 'azztech-demo-v2'
const BASE = new URL('./', self.location).href

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([BASE, `${BASE}index.html`, `${BASE}favicon.svg`, `${BASE}manifest.webmanifest`]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('azztech-demo') && k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || !req.url.startsWith(BASE)) return
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        const fresh = await fetch(req)
        if (fresh && fresh.ok) cache.put(req, fresh.clone())
        return fresh
      } catch {
        const cached = await cache.match(req, { ignoreSearch: true })
        if (cached) return cached
        if (req.mode === 'navigate') {
          const index = (await cache.match(BASE)) || (await cache.match(`${BASE}index.html`))
          if (index) return index
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      }
    })()
  )
})
