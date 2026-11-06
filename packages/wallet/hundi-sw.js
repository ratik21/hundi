// Keeps a host page working in airplane mode. Serve this file from the site root.
const CACHE = "hundi-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "hundi-cache") {
    event.waitUntil(
      caches.open(CACHE).then((cache) => cache.addAll(event.data.urls))
    );
  }
});

const fromNetworkThenCache = async (request) => {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      await cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const match = await cache.match(request, { ignoreSearch: true });
    if (match) {
      return match;
    }
    const page = request.mode === "navigate" && (await cache.match("/"));
    return page || Response.error();
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (
    request.method === "GET" &&
    new URL(request.url).origin === self.location.origin
  ) {
    event.respondWith(fromNetworkThenCache(request));
  }
});
