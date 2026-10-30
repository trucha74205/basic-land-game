/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
// app shell, fonts and the default art are precached so the app starts offline (I-21)
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//, /^\/img\//, /^\/ws/] }));

// custom art: cache first, 400 entries, 60 days (I-20)
registerRoute(
  ({ url }) => url.pathname.startsWith("/img/"),
  new CacheFirst({ cacheName: "scryfall-art", plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 86_400 })] }),
);

interface PushPayload {
  title: string;
  body: string;
  gameId: string;
  tag: string;
}

self.addEventListener("push", (event) => {
  let p: PushPayload | null = null;
  try {
    p = event.data?.json() as PushPayload;
  } catch {
    p = null;
  }
  if (!p) return;
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      icon: "/icons/icon-192.png",
      data: { gameId: p.gameId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = `/g/${event.notification.data?.gameId ?? ""}`;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = all.find((c) => new URL(c.url).pathname === url) ?? all[0];
      if (open) {
        await open.focus();
        if (new URL(open.url).pathname !== url) await open.navigate(url);
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
