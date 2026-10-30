import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { PixelModal } from "@pxlkit/ui-kit";

const FadeCtx = createContext<HTMLElement | null>(null);
const FADE_MS = 380;

/** Fades its content in and, once it becomes `null`, keeps showing the last content while it fades out. The kit's modal unmounts at once, so modals are rendered inside this. */
export function Fade({ children }: { children: ReactNode }) {
  const [el] = useState(() => {
    const d = document.createElement("div");
    d.style.cssText = `position:relative;z-index:100;opacity:0;transition:opacity ${FADE_MS}ms ease-in-out`;
    return d;
  });
  const kept = useRef<ReactNode>(null);
  const [leaving, setLeaving] = useState(false);
  const has = children != null && children !== false;
  if (has) kept.current = children;

  useEffect(() => {
    document.body.appendChild(el);
    return () => el.remove();
  }, [el]);
  useEffect(() => {
    if (has) {
      setLeaving(false);
      el.style.pointerEvents = "";
      const id = requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = "1")));
      return () => cancelAnimationFrame(id);
    }
    if (!kept.current) return;
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    setLeaving(true);
    const id = setTimeout(() => ((kept.current = null), setLeaving(false)), FADE_MS + 20);
    return () => clearTimeout(id);
  }, [has, el]);

  if (!has && !leaving) return null;
  return <FadeCtx.Provider value={el}>{kept.current}</FadeCtx.Provider>;
}

/** PixelModal that portals into the surrounding Fade. */
export function FadeModal(props: ComponentProps<typeof PixelModal>) {
  return <PixelModal container={useContext(FadeCtx)} {...props} />;
}
