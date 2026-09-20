const CACHE = "gestao-futuro-shell-v36";
const SHELL = [
  "/", "/index.html", "/styles.css", "/manifest.webmanifest",
  "/assets/app-icon-192.png", "/assets/app-icon-512.png", "/assets/logo-futuro.png", "/assets/hero-futuro.webp",
  "/app/brand.js", "/app/core.js", "/app/secretaria.js", "/app/gestao.js", "/app/comercial.js", "/app/integracoes.js", "/app/start.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match("/index.html"))));
});


self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Gestão Futuro";
  const options = {
    body: data.body || "Nova atualização disponível.",
    icon: data.icon || "/assets/app-icon-192.png",
    badge: data.badge || "/assets/app-icon-192.png",
    data: { url: data.url || "/" },
    vibrate: [220, 100, 220, 100, 320],
    tag: "gestao-futuro-" + (data.title || "alerta"),
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target).catch(()=>{});
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    })
  );
});
