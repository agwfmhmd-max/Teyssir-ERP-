const CACHE_NAME = 'mda-erp-v3'; // قمت بتغيير الاسم لفرض التحديث

self.addEventListener('install', (e) => {
  self.skipWaiting(); // هذا السطر يجبر المتصفح على تثبيت التحديث فوراً
  console.log('[Service Worker] Install New Version');
});

self.addEventListener('activate', (e) => {
  // تنظيف الكاش القديم
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // الاعتماد على الشبكة دائماً للحصول على أحدث نسخة (Network First)
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});