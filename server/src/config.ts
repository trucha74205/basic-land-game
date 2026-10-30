import { resolve } from "node:path";

export interface Config {
  port: number;
  host: string;
  publicUrl: string | null;
  dataDir: string;
  staticDir: string | null;
  vapid: { publicKey: string; privateKey: string } | null;
  contactEmail: string;
  trustProxy: boolean;
  imageCacheMaxMb: number;
  autoPassMs: [number, number];
  finishedRetentionDays: number;
  idleRetentionDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const num = (k: string, d: number): number => {
    const v = env[k];
    if (v === undefined || v === "") return d;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a non-negative number`);
    return n;
  };
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const lo = num("AUTO_PASS_MIN_MS", 1000);
  const hi = num("AUTO_PASS_MAX_MS", 3000);
  if (hi < lo) throw new Error("AUTO_PASS_MAX_MS must not be below AUTO_PASS_MIN_MS");
  return {
    port: num("PORT", 3000),
    host: env.HOST ?? "0.0.0.0",
    publicUrl: env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/$/, "") : null,
    dataDir: resolve(env.DATA_DIR ?? "./data"),
    staticDir: env.STATIC_DIR ? resolve(env.STATIC_DIR) : null,
    vapid: publicKey && privateKey ? { publicKey, privateKey } : null,
    contactEmail: env.CONTACT_EMAIL ?? "you@example.com",
    trustProxy: env.TRUST_PROXY === "true",
    imageCacheMaxMb: num("IMAGE_CACHE_MAX_MB", 1024),
    autoPassMs: [lo, hi],
    finishedRetentionDays: num("FINISHED_RETENTION_DAYS", 30),
    idleRetentionDays: num("IDLE_RETENTION_DAYS", 14),
  };
}
