import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame, useShown } from "@/lib/store";
import { t } from "@/lib/i18n";
import { PixelButton } from "@pxlkit/ui-kit";
import { Fade, FadeModal } from "./Fade";
import { useGameApi } from "./GameContext";
import { CTA } from "@/lib/ui";
import { useKey } from "@/lib/shortcuts";

/** W-38: result and reason, with Rematch. */
export function Result({ onRematchGame }: { onRematchGame: (gameId: string) => void }) {
  const { seat, seats, rematch, status } = useGame();
  const { view } = useShown();
  const api = useGameApi();
  const nav = useNavigate();
  const r = view?.result;
  const [hidden, setHidden] = useState(false);
  useKey((e) => (r && e.key.toLowerCase() === "h" ? (setHidden((h) => !h), true) : false));
  if (!r) return status === "abandoned" ? <p role="alert" className="p-4">This game was started with older rules and cannot be resumed.</p> : null;

  const name = (p: number) => seats.find((s) => s.seat === p)?.nickname ?? "?";
  const opp = seat === 0 ? 1 : 0;
  const title = r.kind === "win" ? (r.player === seat ? t("result.won") : t("result.lost")) : r.kind === "draw" ? t("result.draw") : t("result.cancelled");
  const reason = r.kind === "win" ? t(`result.${r.condition}`) : r.kind === "draw" ? t("result.maxTurns") : "";
  const voted = rematch.votes.includes(seat as number);
  const oppVoted = rematch.votes.includes(opp);

  const bar = hidden && (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <PixelButton tone="purple" className={CTA} onClick={() => setHidden(false)}>{title}: {t("popup.show")}</PixelButton>
    </div>
  );

  return (
    <>
    {bar}
    <Fade>
    {hidden ? null : (
    <FadeModal
      open
      title={title}
      description={reason}
      closeLabel="no-close"
      onClose={() => undefined}
      footer={
        <>
          <PixelButton tone="neutral" variant="outline" onClick={() => setHidden(true)}>{t("popup.hide")}</PixelButton>
          <PixelButton tone="neutral" variant="outline" onClick={() => nav("/")}>{t("menu.home")}</PixelButton>
          {rematch.nextGameId ? (
            <PixelButton tone="purple" className={CTA} onClick={() => onRematchGame(rematch.nextGameId!)}>{t("result.rematch")}</PixelButton>
          ) : (
            <PixelButton tone="purple" className={CTA} disabled={voted} onClick={api.rematch}>{t("result.rematch")}</PixelButton>
          )}
        </>
      }
    >
      {!rematch.nextGameId && oppVoted && !voted && <p role="status">{t("result.rematchOpp", { name: name(opp) })}</p>}
      {!rematch.nextGameId && voted && <p role="status">{t("result.rematchWaiting", { name: name(opp) })}</p>}
    </FadeModal>
    )}
    </Fade>
    </>
  );
}
