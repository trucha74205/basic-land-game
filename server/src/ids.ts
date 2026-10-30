import { createHash, randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 8 characters of Crockford base32 = 40 bits (S-04). */
export function newInviteCode(): string {
  const b = randomBytes(5);
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out = CROCKFORD[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return out;
}

/** Crockford decoding: case-insensitive, I and L read as 1, O reads as 0, U is invalid. */
export function normalizeInviteCode(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(s) ? s : null;
}

export const newGameId = (): string => randomBytes(9).toString("base64url");
/** 128-bit seat token (W-12). */
export const newToken = (): string => randomBytes(16).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const newSeed = (): string => randomBytes(8).toString("hex");
