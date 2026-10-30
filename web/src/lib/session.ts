import type { ArtChoice } from "./art";

export interface SavedSeat {
  token: string;
  seat: 0 | 1;
  nickname: string;
  /** Invite code, kept for the creator so the lobby can show the link. */
  code?: string;
  savedAt: number;
}

export type AnimSpeed = "off" | "fast" | "normal" | "slow";
export interface Settings {
  sound: boolean;
  vibration: boolean;
  /** Speed of the lines that connect cards on the stack and of the resolution steps; "off" shows static lines and resolves at once. */
  anim: AnimSpeed;
  /** Desktop game log panel shown. */
  log: boolean;
}

const SESSIONS = "blg.sessions";
const NICK = "blg.nickname";
const ART = "blg.art";
const SETTINGS = "blg.settings";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be unavailable (private mode); the app still works for this visit */
  }
}

export const getSessions = (): Record<string, SavedSeat> => read(SESSIONS, {});
export const getSession = (gameId: string): SavedSeat | null => getSessions()[gameId] ?? null;
export function saveSession(gameId: string, s: Omit<SavedSeat, "savedAt">): void {
  const all = getSessions();
  all[gameId] = { ...s, savedAt: Date.now() };
  // keep the list short: newest 10
  const keep = Object.entries(all).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 10);
  write(SESSIONS, Object.fromEntries(keep));
}
export function forgetSession(gameId: string): void {
  const all = getSessions();
  delete all[gameId];
  write(SESSIONS, all);
}

export const getNickname = (): string => read(NICK, "");
export const saveNickname = (n: string): void => write(NICK, n);

export const getArt = (): ArtChoice => read(ART, {});
export const saveArt = (a: ArtChoice): void => write(ART, a);

export const getSettings = (): Settings => ({ sound: true, vibration: true, anim: "normal", log: true, ...read<Partial<Settings>>(SETTINGS, {}) });
export const saveSettings = (s: Settings): void => {
  write(SETTINGS, s);
  window.dispatchEvent(new Event("blg:settings"));
};

/** Reads `#t=<token>` from a rejoin link and removes it from the address bar (W-13). */
export function takeTokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)t=([\w-]+)/.exec(hash);
  return m ? m[1]! : null;
}
