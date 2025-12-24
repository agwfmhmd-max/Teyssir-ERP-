self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
  // السماح بمرور جميع الطلبات للعمل مع Firebase مباشرة
  e.respondWith(fetch(e.request));
});