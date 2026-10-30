import { useRef, useState } from "react";
import type { LandType, StackItem } from "basic-land-engine";
import { artUrl, defaultArtUrl, usesCustomArt } from "@/lib/art";
import type { ArtChoice } from "@/lib/art";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Mark } from "@/lib/stack";

const MARK: Record<Mark["tone"], string> = {
  red: "bg-red-600 border-red-500",
  green: "bg-green-600 border-green-500",
  blue: "bg-sky-600 border-sky-500",
  grey: "bg-zinc-700 border-zinc-500",
};

export const FRAME: Record<LandType, string> = {
  Plains: "bg-land-plains text-[color:var(--land-plains-fg)]",
  Island: "bg-land-island text-white",
  Swamp: "bg-land-swamp text-white",
  Mountain: "bg-land-mountain text-white",
  Forest: "bg-land-forest text-white",
};

/** Card width per size; height follows the MTG card ratio of 63 x 88 mm (5:7). */
const WIDTH = { sm: 80, md: 112 } as const;
export const tileHeight = (size: keyof typeof WIDTH) => Math.round((WIDTH[size] * 7) / 5);

export interface TileProps {
  land: LandType;
  art?: ArtChoice;
  where: "battlefield" | "hand" | "graveyard" | "stack";
  size?: "sm" | "md";
  /** Highlighted as a legal choice. */
  hot?: boolean;
  selected?: boolean;
  /** Greyed out while the player has to choose something else. */
  dim?: boolean;
  disabled?: boolean;
  /** What the stack or the last resolution does with this card. */
  mark?: Mark;
  /** Id the connecting lines use to find this card on screen. */
  cardId?: string;
  onPress?: () => void;
  onZoom?: (land: LandType, art?: ArtChoice) => void;
}

/** A land card in MTG proportions: name bar, art window, type line and text box in a land-coloured frame. Tap acts, long-press or the Z key zooms (W-30). */
export function Tile({ land, art, where, size = "md", hot, selected, dim, disabled, mark, cardId, onPress, onZoom }: TileProps) {
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const src = failed ? defaultArtUrl(land, "art_crop") : artUrl(land, art, "art_crop"); // W-61 fallback
  const label = t(where === "hand" ? "tile.hand" : where === "graveyard" ? "tile.graveyard" : "tile.battlefield", { land }) + (mark ? ", " + mark.text : "") + (selected ? ", selected" : hot ? ", " + t("tile.selectable") : "");
  const w = WIDTH[size];

  const down = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onZoom?.(land, art);
    }, 450);
  };
  const up = () => timer.current && clearTimeout(timer.current);

  const interactive = !!onPress && !disabled;
  return (
    <div
      data-ref={cardId}
      style={{ width: w, height: tileHeight(size) }}
      className={cn("relative shrink-0 drop-shadow-md transition-transform", selected && "-translate-y-2", hot && !selected && "tile-hot", dim && "opacity-40 grayscale")}
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        disabled={!interactive && !onZoom}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        onContextMenu={(e) => {
          e.preventDefault();
          onZoom?.(land, art);
        }}
        onKeyDown={(e) => e.key.toLowerCase() === "z" && onZoom?.(land, art)}
        onClick={() => {
          if (longPressed.current) return;
          if (interactive) onPress!();
          else onZoom?.(land, art);
        }}
        className="px-card absolute inset-0 touch-manipulation select-none bg-black p-px text-left !min-h-0"
      >
        <span className={cn("px-card flex h-full w-full flex-col gap-[3px] bg-linear-to-br from-white/25 to-black/25 p-[3px]", FRAME[land])}>
          <span className="flex h-[18px] shrink-0 items-center rounded-[3px] bg-[var(--parchment)] px-1 text-black" aria-hidden="true">
            <span className="brand truncate text-[12px] font-bold leading-none">
              {land}
              {usesCustomArt(land, art) ? "*" : ""}
            </span>
          </span>
          <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} className={cn("w-full shrink-0 rounded-[2px] border border-black/50 object-cover", size === "sm" ? "aspect-[3/2]" : "aspect-[7/5]")} />
          <span className="flex min-h-0 flex-1 flex-col items-center rounded-[3px] text-black" style={{ background: `linear-gradient(to bottom, color-mix(in oklab, var(--land-${land.toLowerCase()}) 15%, white), color-mix(in oklab, var(--land-${land.toLowerCase()}) 85%, white))` }} aria-hidden="true">
            <span className={cn("flex w-full shrink-0 items-center px-1 text-[9px] leading-none", size === "sm" ? "h-[13px]" : "h-4")}>
              <span className="truncate">{size === "sm" ? t("tile.type") : `${t("tile.type")} - ${land}`}</span>
            </span>
            <span className="flex min-h-0 flex-1 items-center justify-center">
              <img src={`/icons/mana-${land.toLowerCase()}.png`} alt="" draggable={false} style={{ height: size === "sm" ? 18 : 30, width: size === "sm" ? 18 : 30, imageRendering: "pixelated" }} />
            </span>
          </span>
        </span>
      </button>
      {selected && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute -inset-1.5 rounded-lg border-[3px] border-[var(--highlight)] shadow-[0_0_18px_4px_var(--highlight)]" />
          <span aria-hidden="true" className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--highlight)] px-2 text-[11px] font-bold leading-5 text-black shadow">
            {t("tile.selectedBadge")}
          </span>
        </>
      )}
      {mark && (
        <>
          <span aria-hidden="true" className={cn("pointer-events-none absolute -inset-1 rounded-md border-2", MARK[mark.tone])} style={{ background: "transparent" }} />
          <span aria-hidden="true" className={cn("pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border px-1.5 text-[10px] font-bold leading-4 text-white shadow", MARK[mark.tone])}>
            {mark.text}
          </span>
        </>
      )}
      {hot && !selected && <span aria-hidden="true" className="pointer-events-none absolute -inset-1.5 rounded-lg border-[3px] border-dashed border-[var(--highlight)]" />}
    </div>
  );
}

/** A stack item as a card; a counter shows the land discarded as its cost layered behind the Island. */
export function StackTile({ item, art, size = "sm", onZoom, anchored }: { item: StackItem; art?: ArtChoice; size?: "sm" | "md"; onZoom?: TileProps["onZoom"]; anchored?: boolean }) {
  if (item.kind === "landDrop") return <Tile land={item.card.type} art={art} where="stack" size={size} onZoom={onZoom} cardId={anchored ? item.card.id : undefined} />;
  const dx = size === "sm" ? 14 : 20;
  const dy = size === "sm" ? 10 : 14;
  return (
    <div className="relative shrink-0" style={{ width: WIDTH[size] + dx, height: tileHeight(size) + dy }}>
      <div className="absolute right-0 top-0 z-0 brightness-75">
        <Tile land={item.other.type} art={art} where="graveyard" size={size} mark={{ text: t("mark.cost"), tone: "grey" }} cardId={anchored ? item.other.id : undefined} />
      </div>
      <div className="absolute bottom-0 left-0 z-10">
        <Tile land={item.island.type} art={art} where="stack" size={size} onZoom={onZoom} cardId={anchored ? item.island.id : undefined} />
      </div>
    </div>
  );
}
