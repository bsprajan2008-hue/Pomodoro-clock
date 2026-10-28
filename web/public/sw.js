const CACHE = "pomodoro-nexus-v1";
const CORE = ["/", "/offline.html", "/manifest.webmanifest", "/icons/nexus.svg", "/icons/icon192.png", "/icons/icon512.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && new URL(event.request.url).pathname.startsWith("/assets/")) {
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())));
      }
      return response;
    } catch {
      if (event.request.mode === "navigate") return (await caches.match("/offline.html")) ?? Response.error();
      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
