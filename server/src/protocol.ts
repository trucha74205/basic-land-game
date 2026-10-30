import { z } from "zod";
import { LAND_TYPES } from "basic-land-engine";
import type { Action, GameEvent, LandType, PlayerView } from "basic-land-engine";
import type { ArtChoice, GameStatus } from "./store.js";

export const nickname = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(20).regex(/^[^\u0000-\u001f\u007f]+$/, "control characters are not allowed"));

export const optionsSchema = z
  .object({
    deckSize: z.enum(["full", "half"]).default("full"),
    emptyLibrary: z.enum(["lose", "reshuffle"]).default("lose"),
    maxTurns: z.number().int().min(1).max(1000).nullable().default(null),
    firstPlayer: z.enum(["random", "me", "opponent"]).default("random"),
  })
  .strict();
export type Options = z.infer<typeof optionsSchema>;

export const createBody = z.object({ nickname, options: optionsSchema.default({}) }).strict();
export const joinBody = z.object({ nickname }).strict();

export const landTypeSchema = z.enum(LAND_TYPES);

export const actionSchema: z.ZodType<Action> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PlayLand"), card: z.string().max(64), target: z.string().max(64).optional() }).strict(),
  z.object({ type: z.literal("EndTurn") }).strict(),
  z.object({ type: z.literal("Counter"), island: z.string().max(64), other: z.string().max(64) }).strict(),
  z.object({ type: z.literal("PassCounter") }).strict(),
  z.object({ type: z.literal("ChooseTarget"), card: z.string().max(64) }).strict(),
  z.object({ type: z.literal("Concede"), player: z.union([z.literal(0), z.literal(1)]) }).strict(),
  z.object({ type: z.literal("CancelGame") }).strict(),
]);

const artSchema = z
  .object(Object.fromEntries(LAND_TYPES.map((t) => [t, z.string().uuid().nullable().optional()])) as Record<LandType, z.ZodOptional<z.ZodNullable<z.ZodString>>>)
  .strict();

export const pushBody = z
  .object({
    subscription: z.object({
      endpoint: z.string().url().max(1024),
      keys: z.object({ p256dh: z.string().max(256), auth: z.string().max(128) }),
    }),
  })
  .strict();

export const clientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), gameId: z.string().max(32), token: z.string().max(64), lastVersion: z.number().int().min(0).optional() }).strict(),
  z.object({ t: z.literal("action"), version: z.number().int().min(0), action: actionSchema }).strict(),
  z.object({ t: z.literal("art"), art: artSchema }).strict(),
  z.object({ t: z.literal("rematch") }).strict(),
  z.object({ t: z.literal("visibility"), visible: z.boolean() }).strict(),
  z.object({ t: z.literal("ping") }).strict(),
]);
export type ClientMessage = z.infer<typeof clientMessage>;

export interface SeatSummary {
  seat: 0 | 1;
  nickname: string;
  connected: boolean;
  art: ArtChoice;
}

export type RejectReason = "stale_version" | "illegal" | "not_your_turn" | "game_over" | "bad_art";

export interface RematchState {
  votes: number[];
  nextGameId: string | null;
}

export type ServerMessage =
  | {
      t: "snapshot";
      gameId: string;
      seat: 0 | 1;
      version: number;
      status: GameStatus;
      options: Options;
      seats: SeatSummary[];
      view: PlayerView | null;
      legalActions: Action[];
      events: GameEvent[];
      rematch: RematchState;
    }
  | { t: "update"; version: number; status: GameStatus; events: GameEvent[]; view: PlayerView; legalActions: Action[]; seats: SeatSummary[] }
  | { t: "presence"; seats: SeatSummary[] }
  | { t: "rejected"; reason: RejectReason; version: number }
  | ({ t: "rematch" } & RematchState)
  | { t: "error"; code: "bad_token" | "bad_message" | "rate_limited" | "game_not_found"; message: string }
  | { t: "pong" };
