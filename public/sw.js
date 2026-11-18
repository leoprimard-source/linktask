// 离线外壳：页面、脚本、样式缓存在手机里，没网也能打开；接口数据不在这里缓存
const C = 'lt-shell-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/uploads/') || u.pathname === '/gate') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(u.pathname === '/' ? '/' : e.request, cp)); } return r; }).catch(() => caches.match(u.pathname === '/' ? '/' : e.request, { ignoreSearch: u.pathname !== '/' })));
});
