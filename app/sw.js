// Foxy for phone: works offline after the first visit, and shows push notifications.
// Pushes carry no data: the worker asks the server what they were about (/m/pending).
const CACHE = "foxy-app-v1";
const FILES = ["./", "index.html", "app.css", "app.js", "fox.js", "acc.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png", "badge-96.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("foxy-app-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Fresh files when online, the saved copy when not
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html"))),
  );
});

async function cred() {
  try {
    const c = await caches.open("foxy-cred");
    const r = await c.match("cred");
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

function line(it) {
  const n = it.n | 0;
  if (it.kind === "poke") return n > 1 ? `${it.name} poked you ${n.toLocaleString("en-US")} times` : `${it.name} poked you`;
  return `${it.name} says hi`;
}

self.addEventListener("push", (e) => {
  e.waitUntil(
    (async () => {
      const c = await cred();
      let list = [];
      if (c && c.relay) {
        try {
          const r = await fetch(`${c.relay}/m/pending?id=${encodeURIComponent(c.id)}&token=${encodeURIComponent(c.token)}`, { cache: "no-store" });
          const j = await r.json();
          if (j.ok) list = j.list || [];
        } catch {}
      }
      const opts = (tag) => ({ icon: "icon-192.png", badge: "badge-96.png", tag, renotify: true, data: { url: "./" } });
      if (!list.length) return self.registration.showNotification("Foxy", { body: "Someone poked you", ...opts("foxy") });
      for (const it of list.slice(0, 4)) {
        await self.registration.showNotification(line(it), { body: "", ...opts("poke-" + it.from) });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./");
    }),
  );
});
