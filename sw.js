const CACHE = "liga-dos-ultimos-v1";
const FILES = ["./","./index.html","./style.css","./app.js","./manifest.json",
  "./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res && res.ok && new URL(e.request.url).origin === location.origin) {
      const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp));
    }
    return res;
  }).catch(() => caches.match("./index.html"))));
});
