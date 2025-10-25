/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

const RECORD_CACHE = 'timebox-records'
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30

self.addEventListener('message', (event) => {
  const data = event.data as
    | {
        type: 'sync-records'
        payload: { key: string; value: unknown; timestamp: number }
      }
    | { type: 'SKIP_WAITING' }
    | undefined

  if (!data) return

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (data.type === 'sync-records') {
    const { key, value, timestamp } = data.payload
    event.waitUntil(storeRecords(key, value, timestamp))
  }
})

async function storeRecords(key: string, value: unknown, timestamp: number) {
  const cache = await caches.open(RECORD_CACHE)
  const url = new URL(`/data-cache/${key}.json`, self.registration.scope || self.origin)
  const response = new Response(JSON.stringify(value), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Recorded-At': `${timestamp}`,
    },
  })
  await cache.put(url.toString(), response)
  await pruneOutdated(cache, timestamp)
}

async function pruneOutdated(cache: Cache, now: number) {
  const requests = await cache.keys()
  await Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request)
      if (!response) return
      const recorded = Number(response.headers.get('X-Recorded-At') ?? 0)
      if (!recorded) return
      if (now - recorded > THIRTY_DAYS) {
        await cache.delete(request)
      }
    }),
  )
}
