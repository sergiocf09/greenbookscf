// Kill-switch service worker.
// Any older service worker previously registered at /sw.js on this origin
// (especially the preview host id-preview--*.lovable.app) is replaced by this
// one. This worker takes control, deletes all caches, and unregisters itself,
// then navigates open clients once so they reload without the SW in control.
//
// Keep this file in place for at least one release cycle even after the PWA
// integration is reconfigured.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.clients.claim();
      } catch {}
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch {}
      try {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        await Promise.all(
          clients.map((c) => {
            try {
              const url = new URL(c.url);
              url.searchParams.set("sw-cleanup", Date.now().toString());
              return c.navigate(url.toString());
            } catch {
              return Promise.resolve();
            }
          })
        );
      } catch {}
      try {
        await self.registration.unregister();
      } catch {}
    })()
  );
});

// Pass through all fetches untouched while we live (one load at most).
self.addEventListener("fetch", () => {});
