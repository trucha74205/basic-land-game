import { Link } from "react-router-dom";
import { PixelCard } from "@pxlkit/ui-kit";
import { t } from "@/lib/i18n";
import { Shell } from "@/components/Shell";

export function About() {
  return (
    <Shell>
      <PixelCard title={t("menu.about")}>
        <div className="grid gap-3">
          <p>{t("about.notice")}</p>
          <p>{t("about.licences")}</p>
        </div>
      </PixelCard>
      <Link to="/" className="text-center text-sm text-muted-foreground underline">{t("menu.home")}</Link>
    </Shell>
  );
}
