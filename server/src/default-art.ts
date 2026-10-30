import type { LandType } from "basic-land-engine";

/** Bundled default printings (W-62). Choosing one of these in the picker means "default" (I-32). */
export const DEFAULT_ART_IDS: Record<LandType, string> = {
  Plains: "4ef17ed4-a9b5-4b8e-b4cb-2ecb7e5898c3",
  Island: "23635e40-d040-40b7-8b98-90ed362aa028",
  Swamp: "13505c15-14e0-4200-82bd-fb9bce949e68",
  Mountain: "1edc5050-69bd-416d-b04c-7f82de2a1901",
  Forest: "d232fcc2-12f6-401a-b1aa-ddff11cb9378",
};
