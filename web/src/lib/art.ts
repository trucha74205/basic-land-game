import type { LandType } from "basic-land-engine";

export const LANDS: readonly LandType[] = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
export type ArtVersion = "art_crop" | "normal" | "small";
export type ArtChoice = Partial<Record<LandType, string | null>>;

/** Bundled default printings, same table as the server (W-62). */
export const DEFAULT_ART_IDS: Record<LandType, string> = {
  Plains: "4ef17ed4-a9b5-4b8e-b4cb-2ecb7e5898c3",
  Island: "23635e40-d040-40b7-8b98-90ed362aa028",
  Swamp: "13505c15-14e0-4200-82bd-fb9bce949e68",
  Mountain: "1edc5050-69bd-416d-b04c-7f82de2a1901",
  Forest: "d232fcc2-12f6-401a-b1aa-ddff11cb9378",
};

export const defaultArtUrl = (land: LandType, version: "art_crop" | "normal"): string => `/art/default/${land}.${version}.jpg`;

/** Image URL for a land in a player's art choice. Null, missing or the default id mean the bundled file (I-30, I-32). */
export function artUrl(land: LandType, choice: ArtChoice | undefined, version: ArtVersion): string {
  const id = choice?.[land];
  if (!id || id === DEFAULT_ART_IDS[land]) return defaultArtUrl(land, version === "normal" ? "normal" : "art_crop");
  return `/img/${id}/${version}`;
}

export const usesCustomArt = (land: LandType, choice: ArtChoice | undefined): boolean => {
  const id = choice?.[land];
  return !!id && id !== DEFAULT_ART_IDS[land];
};

export interface ArtManifest {
  [land: string]: { id: string; set: string; setName: string; collectorNumber: string; artist: string };
}
