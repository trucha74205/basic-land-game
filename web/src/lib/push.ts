import { deletePush, getPushKey, putPush } from "./api";

export type PushState = "unsupported" | "ios-needs-install" | "denied" | "off" | "on";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

const b64ToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** N-10: on iOS the Push API only exists in an installed PWA. */
export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Asks for permission only when called from a tap (N-11). */
export async function enablePush(gameId: string, token: string): Promise<PushState> {
  const state = await pushState();
  if (state === "ios-needs-install" || state === "unsupported") return state;
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const key = await getPushKey();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  await putPush(gameId, token, sub.toJSON());
  return "on";
}

export async function disablePush(gameId: string, token: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await deletePush(gameId, token, sub.toJSON()).catch(() => undefined);
  await sub.unsubscribe();
}
