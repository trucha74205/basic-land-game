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
  const [, rerender] = useState(0);
  const has = children != null && children !== false;
  if (has) kept.current = children;

  useEffect(() => {
    document.body.appendChild(el);
    return () => el.remove();
  }, [el]);
  useEffect(() => {
    if (has) {
      el.style.pointerEvents = "";
      const id = requestAnimationFrame(() => requestAnimationFrame(() => (el.style.opacity = "1")));
      return () => cancelAnimationFrame(id);
    }
    if (!kept.current) return;
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    const id = setTimeout(() => ((kept.current = null), rerender((n) => n + 1)), FADE_MS + 20);
    return () => clearTimeout(id);
  }, [has, el]);

  // while leaving, the last content stays mounted in the same render that turns `has` off, so the modal never remounts mid-fade
  if (!kept.current) return null;
  return <FadeCtx.Provider value={el}>{kept.current}</FadeCtx.Provider>;
}

/** PixelModal that portals into the surrounding Fade. */
export function FadeModal(props: ComponentProps<typeof PixelModal>) {
  return <PixelModal container={useContext(FadeCtx)} {...props} />;
}
