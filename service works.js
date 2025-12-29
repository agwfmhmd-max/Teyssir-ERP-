const CACHE_NAME = 'teyssir-erp-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './logo.png',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install Event: Cache Files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            console.log('Opened cache');
            return cache.addAll(ASSETS);
        })
    );
});

// Activate Event: Cleanup Old Caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Fetch Event: Network First, then Cache
self.addEventListener('fetch', event => {
    // Skip non-GET requests or Firebase API calls (let Firebase SDK handle offline)
    if (event.request.method !== 'GET' || event.request.url.includes('googleapis.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
        .then(response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic' && !response.url.includes('cdn') && !response.url.includes('fonts')) {
                return response;
            }

            // Clone response to cache
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
            .then(cache => {
                cache.put(event.request, responseToCache);
            });

            return response;
        })
        .catch(() => {
            // If offline, return from cache
            return caches.match(event.request);
        })
    );
});