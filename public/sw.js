// เปลี่ยนเลขนี้เมื่อเพิ่ม/ลบไฟล์ใน SHELL เพื่อให้ cache เก่าถูกลบ
const CACHE = "expense-shell-v1";

const SHELL = [
  "/",
  "/style.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API และ request จากโดเมนอื่น (เช่น Google Fonts) ไม่ยุ่ง ให้วิ่งไป network ตรงๆ
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // network-first: ได้เวอร์ชันล่าสุดเสมอเมื่อออนไลน์, ใช้ cache เมื่อออฟไลน์
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/") : Response.error()))
      )
  );
});
