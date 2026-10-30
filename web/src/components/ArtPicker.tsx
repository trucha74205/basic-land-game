import { useEffect, useMemo, useState } from "react";
import type { LandType } from "basic-land-engine";
import { getPrintings } from "@/lib/api";
import type { PrintingItem } from "@/lib/api";
import { LANDS, defaultArtUrl, usesCustomArt } from "@/lib/art";
import type { ArtChoice } from "@/lib/art";
import { t } from "@/lib/i18n";
import { PixelButton, PixelSelect } from "@pxlkit/ui-kit";
import { CTA } from "@/lib/ui";

/** Custom art: Scryfall is only contacted from here, after a tap (W-60, W-63). */
export function ArtPicker({ art, onChange }: { art: ArtChoice; onChange: (a: ArtChoice) => void }) {
  const [land, setLand] = useState<LandType | null>(null);
  const set = (l: LandType, id: string | null) => onChange({ ...art, [l]: id });

  if (land) return <Gallery land={land} current={art[land] ?? null} onPick={(id) => (set(land, id), setLand(null))} onBack={() => setLand(null)} />;
  return (
    <ul className="grid gap-3">
      {LANDS.map((l) => (
        <li key={l} className="flex items-center gap-3">
          <img src={defaultArtUrl(l, "art_crop")} alt="" className="h-12 w-16 rounded-md object-cover" />
          <span className="pixel flex-1 text-lg">
            {l}
            <span className="block font-sans text-sm text-muted-foreground">{usesCustomArt(l, art) ? t("art.custom") : t("art.default")}</span>
          </span>
          <PixelButton tone="purple" className={CTA} size="sm" onClick={() => setLand(l)}>{t("art.custom")}</PixelButton>
          {usesCustomArt(l, art) && (
            <PixelButton tone="neutral" size="sm" variant="outline" onClick={() => set(l, null)}>{t("art.reset")}</PixelButton>
          )}
        </li>
      ))}
    </ul>
  );
}

function Gallery({ land, current, onPick, onBack }: { land: LandType; current: string | null; onPick: (id: string) => void; onBack: () => void }) {
  const [list, setList] = useState<PrintingItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [artist, setArtist] = useState("");
  const [setCode, setSetCode] = useState("");

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () =>
      getPrintings(land)
        .then((p) => {
          if (!live) return;
          if (p === null) timer = setTimeout(poll, 2000); // 202: the server is building the index (I-03)
          else setList(p);
        })
        .catch(() => live && setFailed(true));
    poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [land]);

  const artists = useMemo(() => [...new Set((list ?? []).map((p) => p.artist))].sort(), [list]);
  const sets = useMemo(() => [...new Map((list ?? []).map((p) => [p.set, p.setName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [list]);
  const shown = (list ?? []).filter((p) => (!artist || p.artist === artist) && (!setCode || p.set === setCode));

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <PixelButton tone="neutral" size="sm" variant="outline" onClick={onBack}>{t("action.cancel")}</PixelButton>
        <h3 className="pixel text-lg">{land}</h3>
      </div>
      {failed ? (
        <p role="alert">{t("art.failed")}</p>
      ) : !list ? (
        <p role="status">{t("art.loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <PixelSelect label={t("art.artist")} value={artist} onChange={setArtist} options={[{ value: "", label: t("art.all") }, ...artists.map((a) => ({ value: a, label: a }))]} />
            <PixelSelect label={t("art.set")} value={setCode} onChange={setSetCode} options={[{ value: "", label: t("art.all") }, ...sets.map(([code, name]) => ({ value: code, label: name }))]} />
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p.id)} aria-pressed={p.id === current} className={`block w-full rounded-lg border p-1 text-left ${p.id === current ? "outline-4 outline-primary" : ""}`}>
                  <img src={`/img/${p.id}/small`} alt="" loading="lazy" className="aspect-[488/680] w-full bg-muted object-cover" />
                  <span className="block text-xs">{p.artist}, {p.setName} {p.year}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
