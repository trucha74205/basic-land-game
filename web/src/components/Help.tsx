import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import type { Key } from "@/lib/i18n";
import { HELP_EVENT, SHORTCUTS, dialogOpen, useKey } from "@/lib/shortcuts";
import { PixelButton } from "@pxlkit/ui-kit";
import { Fade, FadeModal } from "./Fade";

const RULES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
type Which = "keys" | "rules" | null;

/** The shortcuts and rules dialogs; opened by ? and R, or from the menu. */
export function HelpHost() {
  const [which, setWhich] = useState<Which>(null);
  useEffect(() => {
    const on = (e: Event) => setWhich((e as CustomEvent<Which>).detail);
    window.addEventListener(HELP_EVENT, on);
    return () => window.removeEventListener(HELP_EVENT, on);
  }, []);
  useKey((e) => {
    const k = e.key.toLowerCase();
    if (dialogOpen() && !which) return false;
    if (k === "?" || k === "r") return (setWhich((w) => (w === (k === "?" ? "keys" : "rules") ? null : k === "?" ? "keys" : "rules")), true);
    return false;
  });
  const close = () => setWhich(null);
  const footer = <PixelButton tone="neutral" variant="outline" onClick={close}>{t("common.close")}</PixelButton>;

  return (
    <>
      <Fade>{which === "keys" ? <FadeModal open title={t("keys.title")} closeLabel={t("common.close")} onClose={close} footer={footer}>
        <dl className="grid max-h-[60dvh] gap-2 overflow-y-auto">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3">
              <dt className="flex shrink-0 items-center gap-1">
                {s.keys.map((k, i) => (k === "-" ? <span key={i}>-</span> : <kbd key={i} className="brand rounded border-2 border-border bg-muted px-1.5 text-sm">{k}</kbd>))}
              </dt>
              <dd className="text-right text-sm">{t(s.label)}</dd>
            </div>
          ))}
        </dl>
      </FadeModal> : null}</Fade>
      <Fade>{which === "rules" ? <FadeModal open title={t("rules.title")} closeLabel={t("common.close")} onClose={close} footer={footer}>
        <div className="grid max-h-[60dvh] gap-3 overflow-y-auto pr-1">
          {RULES.map((n) => (
            <section key={n}>
              <h3 className="pixel text-base">{t(`rules.${n}.title` as Key)}</h3>
              <p className="text-sm">{t(`rules.${n}.body` as Key)}</p>
            </section>
          ))}
        </div>
      </FadeModal> : null}</Fade>
    </>
  );
}
