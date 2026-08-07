// Network-first service worker that ALWAYS revalidates against the network when
// online, so a new deploy shows up immediately. The previous version let the
// browser's HTTP cache serve a stale app.js to the SW's fetch — {cache:'reload'}
// bypasses that. The cache is only a fallback for when you're actually offline.
/* Registered from /app/, so its scope is /app/ and it can never intercept the
   marketing site sharing this origin. The name is app-specific for the same
   reason -- one origin now holds two things and they must not evict each
   other's caches. */
const CACHE = 'kindred-app-v2';

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    try {
      // 'reload' = go to the network and skip the HTTP cache, then refresh ours.
      const res = await fetch(e.request, { cache: 'reload' });
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    } catch (err) {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      throw err;
    }
  })());
});
