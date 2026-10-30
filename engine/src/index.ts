export { createGame, applyAction } from "./engine";
export { getDecision, getLegalActions, actionKey } from "./legal";
export { getView, getEvents } from "./view";
export { DEFAULT_CONFIG } from "./config";
export * from "./types";

/** Bump on every rule change that alters the result of replaying saved actions. */
export const RULES_VERSION = 1;
