/* Teyssir ERP — Service Worker (offline-first)
   Strategy:
   - Shell (HTML/CSS/JS/icons): cache-first with background revalidation.
   - CDN libs (fonts, font-awesome, chart.js, pdfmake, firebase SDK): cache-first.
   - Navigation requests (HTML): network-first, fallback to cached index.
   - Firestore / Firebase APIs / EmailJS: bypass SW entirely (Firebase handles
     its own offline persistence & sync via IndexedDB).

   FIX (offline blank/unstyled page):
   - Use the SW's own registration scope as the base path instead of a hard
     coded "/erp/" prefix. The previous version silently failed to precache
     the shell whenever the site wasn't hosted exactly under "/erp/",
     because `cache.addAll(['/erp/...']).catch(()=>{})` swallowed every 404.
     With relative URLs the precache works on any hosting path (root,
     subfolder, GitHub Pages, etc.) and the app loads fully offline.
*/
const VERSION       = 'teyssir-v13-2026-09-22';
const SHELL_CACHE   = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

// Derive base scope dynamically from the SW location (always ends with "/").
const SCOPE_URL    = new URL('./', self.location);
const SCOPE_PREFIX = SCOPE_URL.pathname; // e.g. "/", "/erp/", "/Teyssir-ERP--main/"

// Shell files, relative to the SW location.
const SHELL_FILES = [
  './',
  'index.html',
  'style.css',
  'modern.css',
  'erp-enhancements.js',
  'script.js',
  'manifest.json',
  'logo.png',
  'icon-192.png',
  'icon-512.png',
];
const SHELL = SHELL_FILES.map((p) => new URL(p, self.location).toString());
const INDEX_URL = new URL('index.html', self.location).toString();
const ROOT_URL  = new URL('./', self.location).toString();

const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'www.gstatic.com',
];

// Hosts the SW must NEVER intercept (Firebase handles its own offline + sync).
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'api.emailjs.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Cache each shell file individually so one 404 doesn't abort the rest.
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (_) { /* ignore */ }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  const data = e.data;
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) self.skipWaiting();
});

function isBypass(url) {
  return BYPASS_HOSTS.some((h) => url.hostname.endsWith(h));
}
function isCdn(url) {
  return CDN_HOSTS.some((h) => url.hostname === h);
}
function isShellPath(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(SCOPE_PREFIX);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  if (isBypass(url)) return; // let Firebase / EmailJS go to network directly

  // Navigation → network-first, fallback to cached index
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(INDEX_URL, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(req)) ||
               (await cache.match(INDEX_URL)) ||
               (await cache.match(ROOT_URL)) ||
               Response.error();
      }
    })());
    return;
  }

  // Shell + CDN assets → cache-first w/ background revalidation
  if (isShellPath(url) || isCdn(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(isShellPath(url) ? SHELL_CACHE : RUNTIME_CACHE);
      const cached = await cache.match(req, { ignoreSearch: false }) ||
                     await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
});
