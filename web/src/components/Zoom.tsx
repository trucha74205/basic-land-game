import { useEffect, useState } from "react";
import type { LandType } from "basic-land-engine";
import { DEFAULT_ART_IDS, artUrl, usesCustomArt } from "@/lib/art";
import type { ArtChoice, ArtManifest } from "@/lib/art";
import { t } from "@/lib/i18n";
import { Fade, FadeModal } from "./Fade";

let manifest: Promise<ArtManifest> | null = null;
const loadManifest = () => (manifest ??= fetch("/art/default/default-art.json").then((r) => r.json()));

/** Full card image with the artist credit (W-30, W-91). */
export function Zoom({ zoom, onClose }: { zoom: { land: LandType; art?: ArtChoice } | null; onClose: () => void }) {
  const [credit, setCredit] = useState<string | null>(null);
  useEffect(() => {
    setCredit(null);
    if (!zoom) return;
    if (usesCustomArt(zoom.land, zoom.art)) return setCredit(t("zoom.custom"));
    loadManifest()
      .then((m) => {
        const e = m[zoom.land];
        if (e && e.id === DEFAULT_ART_IDS[zoom.land]) setCredit(t("zoom.credit", { artist: e.artist, set: e.set.toUpperCase(), no: e.collectorNumber }));
      })
      .catch(() => undefined);
  }, [zoom]);

  return (
    <Fade>
      {zoom && (
        <FadeModal open title={zoom.land} description={credit} size="sm" onClose={onClose}>
          <img src={artUrl(zoom.land, zoom.art, "normal")} alt={zoom.land} className="w-full rounded-xl shadow-lg" onError={(e) => ((e.target as HTMLImageElement).src = `/art/default/${zoom.land}.normal.jpg`)} />
        </FadeModal>
      )}
    </Fade>
  );
}
