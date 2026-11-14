/*
 * Rapidy service worker.
 *
 * Estrategia deliberadamente conservadora:
 * - Nunca cachea navegación (HTML), API/SSE ni respuestas autenticadas.
 * - Solo cachea assets estáticos propios del origen.
 * - Assets con hash de Vite (/assets/*) son inmutables: cache-first.
 * - Resto de estáticos (imágenes públicas, fuentes): network-first con
 *   fallback a caché para no servir versiones viejas cuando hay red.
 * - Al activarse una versión nueva se borran TODAS las cachés `rapidy-*`
 *   anteriores y se reclaman las pestañas abiertas.
 *
 * IMPORTANTE: subir CACHE_VERSION en cada deploy que cambie assets públicos
 * o la lógica de este archivo. Ver docs/production/PWA.md.
 */

const CACHE_ROOT = 'rapidy-';
const CACHE_VERSION = 'v5';
const CACHE_NAME = `${CACHE_ROOT}static-${CACHE_VERSION}`;
const MAX_CACHE_ENTRIES = 120;

const STATIC_EXTENSIONS =
  /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot)$/i;

// Assets emitidos por Vite: el nombre incluye content-hash, por lo que son
// inmutables y seguros para cache-first.
const IMMUTABLE_PATH = /^\/assets\//;

function isCacheableResponse(response) {
  return (
    !!response &&
    response.status === 200 &&
    response.type === 'basic' &&
    !response.redirected
  );
}

function isCacheableRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  // API, SSE y metadata de la PWA: siempre red.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return false;
  if (url.pathname === '/events' || url.pathname.startsWith('/events/')) return false;
  if (
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/manifest-partners.json'
  ) {
    return false;
  }

  // Navegación y respuestas HTML/JSON nunca se cachean.
  if (request.mode === 'navigate') return false;
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html') || accept.includes('application/json')) return false;

  // No cachear peticiones con credenciales explícitas, rangos, no-store o
  // query strings (evita URLs firmadas / parámetros de cache-busting).
  if (request.headers.has('authorization')) return false;
  if (request.headers.has('range')) return false;
  if (request.cache === 'no-store') return false;
  if (url.search) return false;

  return STATIC_EXTENSIONS.test(url.pathname);
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHE_ENTRIES) return;
  const excess = keys.length - MAX_CACHE_ENTRIES;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    try {
      await cache.put(request, response.clone());
      trimCache(cache).catch(() => {});
    } catch {
      // Si falla la escritura de caché, la respuesta de red sigue siendo válida.
    }
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      try {
        await cache.put(request, response.clone());
        trimCache(cache).catch(() => {});
      } catch {
        // Si falla la escritura de caché, la respuesta de red sigue siendo válida.
      }
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', (event) => {
  // No precacheamos shell: evita servir HTML/versiones viejas.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_ROOT) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();

      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: 'RAPIDY_SW_ACTIVATED', version: CACHE_VERSION });
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!isCacheableRequest(event.request, url)) return;

  event.respondWith(
    (IMMUTABLE_PATH.test(url.pathname)
      ? cacheFirst(event.request)
      : networkFirst(event.request)
    ).catch(
      () =>
        new Response('', {
          status: 504,
          statusText: 'Offline',
        })
    )
  );
});