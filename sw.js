const CACHE_NAME = 'OfflineGHT-v1';
const FILES_TO_CACHE = [
  'ght-i.html',
  'icon-192.png',
  'grkkeyboard.png'
];

// Install: cache the required files, then activate immediately.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove old caches and take control.
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys.map(key =>
            key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()
          )
        )
      ),
      self.clients.claim()
    ])
  );
});

// Cache-then-network: serve cached content immediately while updating it.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Handle only same-origin GET requests.
  if (url.origin !== self.location.origin || request.method !== 'GET') {
    return;
  }

  const updatePromise = (async () => {
    const cached = await caches.match(request);
    const response = await fetch(request);

    if (!response.ok || response.status !== 200) {
      return response;
    }

    let pageChanged = false;

    // Detect changes to the main HTML by comparing actual contents.
    if (url.pathname.endsWith('/ght-i.html') && cached) {
      const oldHTML = await cached.clone().text();
      const newHTML = await response.clone().text();
      pageChanged = oldHTML !== newHTML;
    }

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());

    // Notify only after the new page is safely cached.
    if (pageChanged) {
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({ type: 'UPDATE_AVAILABLE' });
      });
    }

    return response;
  })();

  // Keep the network update alive even when returning the cache immediately.
  event.waitUntil(updatePromise.then(() => undefined).catch(() => {}));

  event.respondWith((async () => {
    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    // First visit or uncached resource: wait for the network.
    try {
      return await updatePromise;
    } catch {
      // No cached response and network unavailable.
      return new Response('This resource is unavailable offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

// Allow a newly installed service worker to activate immediately.
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});
