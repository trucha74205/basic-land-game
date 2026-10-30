import type { ArtChoice } from "./art";

export interface Options {
  deckSize: "full" | "half";
  emptyLibrary: "lose" | "reshuffle";
  maxTurns: number | null;
  firstPlayer: "random" | "me" | "opponent";
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? "error", body?.error?.message ?? res.statusText);
  return { status: res.status, body: body as T };
}

export const createGame = (nickname: string, options: Options) =>
  call<{ gameId: string; code: string; seat: 0; token: string }>("/api/games", { method: "POST", body: JSON.stringify({ nickname, options }) }).then((r) => r.body);

export const getInvite = (code: string) =>
  call<{ gameId: string; creatorNickname: string; options: Options; full: boolean }>(`/api/invites/${encodeURIComponent(code)}`).then((r) => r.body);

export const joinGame = (code: string, nickname: string) =>
  call<{ gameId: string; seat: 1; token: string }>(`/api/invites/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify({ nickname }) }).then((r) => r.body);

export interface PrintingItem {
  id: string;
  set: string;
  setName: string;
  artist: string;
  year: number;
  collectorNumber: string;
}

/** `null` while the server is still building the index (202). */
export const getPrintings = (land: string) =>
  call<{ status: string; printings?: PrintingItem[] }>(`/api/printings/${land}`).then((r) => (r.status === 202 ? null : r.body.printings ?? []));

export const getPushKey = () => call<{ key: string }>("/api/push/key").then((r) => r.body.key);

export const putPush = (gameId: string, token: string, subscription: PushSubscriptionJSON) =>
  call<null>(`/api/games/${gameId}/push`, { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ subscription }) });

export const deletePush = (gameId: string, token: string, subscription: PushSubscriptionJSON) =>
  call<null>(`/api/games/${gameId}/push`, { method: "DELETE", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ subscription }) });

export type { ArtChoice };
