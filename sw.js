// Guarda a «casca» da app para abrir depressa (e sem rede mostra a última versão); os dados vêm sempre do Supabase.
const VERSAO = 'series-web-1';
const FICHEIROS = ['./', './index.html', './estilo.css', './app.js', './manifest.webmanifest', './icones/180.png', './icones/192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(FICHEIROS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;   // Supabase, imagens: sempre da rede
  // primeiro a rede (para apanhar versões novas), sem rede a guardada
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request)));
});
