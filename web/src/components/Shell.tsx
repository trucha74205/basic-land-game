import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { t } from "@/lib/i18n";

/** Centered page for the non-game screens: brand header over a soft glow. */
export function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="page-glow min-h-dvh">
      <main className={`mx-auto grid gap-6 px-4 py-10 ${wide ? "max-w-xl" : "max-w-md"}`}>
        <Link to="/" className="brand text-center text-4xl tracking-wide no-underline" aria-label={t("app.title")}>
          {t("app.title")}
        </Link>
        {children}
      </main>
    </div>
  );
}
