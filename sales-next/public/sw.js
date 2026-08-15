// 極簡 Service Worker：cache-first 靜態資產、network-first 頁面。
// 目的：Demo 現場斷網時，已載入過的產品仍能完整運作（資料本來就在 localStorage）。
const CACHE = "sales-next-v2";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE || self.location.hostname === "localhost")
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  // 開發時不要攔 Next dev server，避免舊 chunk / RSC payload 被 PWA cache 卡住。
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(svg|png|ico|woff2?)$/)) {
    // 靜態資產：cache-first
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      })
    );
  } else {
    // 頁面：network-first，斷網時回快取
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/")))
    );
  }
});
