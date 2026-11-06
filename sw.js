// Smart Attendance PWA Service Worker (Auto-Update Engine V4 - Sync Frame Snapshot & Anti-Occlusion)
const CACHE_NAME = 'attendance-pwa-v4';

self.addEventListener('install', (event) => {
  // บังคับข้ามการรอ เพื่อเปิดใช้งาน Service Worker ตัวใหม่ล่าสุดทันที
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // ล้างแคชเวอร์ชันเก่าทั้งหมดทิ้ง เพื่อให้ผู้ใช้ได้รับโค้ดใหม่ล่าสุด 100%
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 1. คำขอ API ไปยัง Google Sheets/Apps Script ให้ดึงข้อมูลสดเสมอ ห้ามแคช
  if (event.request.url.includes('script.google.com') || event.request.method !== 'GET') {
    return;
  }

  // 2. Network-First Strategy: ดึงไฟล์เวอร์ชันล่าสุดจาก Netlify เสมอ
  // หากมีการอัปเดตโค้ดบน GitHub/Netlify ผู้ใช้จะได้ไฟล์ใหม่ทันที
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // หากเน็ตหลุด ให้ดึงจากแคชในเครื่อง
        return caches.match(event.request);
      })
  );
});
