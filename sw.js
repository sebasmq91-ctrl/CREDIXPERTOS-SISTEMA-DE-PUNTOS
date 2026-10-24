// sw.js — Hace que la app cargue rápido y abra aunque la conexión sea mala.
// Siempre intenta primero la versión más reciente desde internet; el respaldo guardado solo se usa si no hay red.
// No toca las llamadas a Supabase: los datos siempre vienen en vivo.
const VERSION = 'cx-v1';
const BASICOS = ['./', 'login.html', 'config.js', 'movil.css', 'movil.js', 'manifest.webmanifest', 'icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(BASICOS.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if(res && res.ok){ const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('login.html')))
  );
});
