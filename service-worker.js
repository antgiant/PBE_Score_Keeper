const APP_VERSION = "2.19.0";
const CACHE_NAME = `pbe-score-keeper-${APP_VERSION}`;
const PRECACHE_URLS = [
  "./",
  "index.html",
  "site.webmanifest",
  "css/jquery-ui.min.css",
  "css/styles.css",
  "scripts/jquery-3.7.1.min.js",
  "scripts/jquery-ui.min.js",
  "scripts/yjs-bundle.min.js",
  "scripts/app-globals.js",
  "scripts/app-yjs.js",
  "scripts/app-i18n.js",
  "scripts/app-theme.js",
  "scripts/app-ui-mode.js",
  "scripts/app-header-menu.js",
  "scripts/app-state.js",
  "scripts/app-data.js",
  "scripts/app-summaries.js",
  "scripts/app-display.js",
  "scripts/app-storage.js",
  "scripts/app.js",
  "scripts/app-reorder.js",
  "scripts/app-snapshot.js",
  "scripts/app-import-export.js",
  "scripts/app-backup.js",
  "scripts/app-history.js",
  "scripts/app-block-manager.js",
  "scripts/app-team-manager.js",
  "scripts/app-sync-crypto.js",
  "scripts/app-sync.js",
  "scripts/i18n/en.js",
  "scripts/i18n/es.js",
  "scripts/i18n/fr.js",
  "scripts/i18n/pig.js",
  "apple-touch-icon.png",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "images/ui-icons_444444_256x240.png",
  "images/ui-icons_555555_256x240.png",
  "images/ui-icons_777620_256x240.png",
  "images/ui-icons_777777_256x240.png",
  "images/ui-icons_cc0000_256x240.png",
  "images/ui-icons_ffffff_256x240.png"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept") && request.headers.get("accept").includes("text/html"));
}

function cacheFirst(request) {
  return caches.match(request).then(function(cachedResponse) {
    if (cachedResponse) {
      return cachedResponse;
    }

    return fetch(request).then(function(networkResponse) {
      if (networkResponse && networkResponse.ok) {
        var responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, responseClone);
        });
      }
      return networkResponse;
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(function(networkResponse) {
    if (networkResponse && networkResponse.ok) {
      var responseClone = networkResponse.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, responseClone);
      });
    }
    return networkResponse;
  }).catch(function() {
    return caches.match(request).then(function(cachedResponse) {
      return cachedResponse || caches.match("index.html");
    });
  });
}

self.addEventListener("fetch", function(event) {
  if (event.request.method !== "GET") {
    return;
  }

  var requestUrl = new URL(event.request.url);

  if (!isSameOrigin(requestUrl)) {
    return;
  }

  if (isNavigationRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});