/* Service worker mínimo: torna o site instalável e mostra uma página amigável sem internet.
 * NÃO guarda vídeo, API nem dados em cache — a transmissão ao vivo e o Supabase passam sempre direto pela rede. */
const CACHE = "quixicongo-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/logo.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("quixicongo-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || r.mode !== "navigate") return; // só páginas; o resto não é interceptado
  e.respondWith(fetch(r).catch(() => caches.match(OFFLINE)));
});
