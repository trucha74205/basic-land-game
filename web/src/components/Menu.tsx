import { useEffect, useState } from "react";
import { MenuIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/store";
import { t } from "@/lib/i18n";
import type { Key } from "@/lib/i18n";
import { disablePush, enablePush, pushState } from "@/lib/push";
import type { PushState } from "@/lib/push";
import { getArt, getSettings, saveArt, saveSettings } from "@/lib/session";
import type { AnimSpeed, Settings } from "@/lib/session";
import { PixelAlertDialog, PixelButton, PixelDrawer, PixelIconButton, PixelSwitch, useDarkMode } from "@pxlkit/ui-kit";
import { ArtPicker } from "./ArtPicker";
import { useGameApi } from "./GameContext";
import { CTA } from "@/lib/ui";
import { openHelp } from "@/lib/shortcuts";

type Panel = "menu" | "art";

export function Menu({ onSettings }: { onSettings: (s: Settings) => void }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("menu");
  const [confirm, setConfirm] = useState<"concede" | "cancel" | null>(null);
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState(getSettings());
  const [push, setPush] = useState<PushState | null>(null);
  const [art, setArt] = useState(getArt());
  const { seat, status } = useGame();
  const api = useGameApi();
  const nav = useNavigate();
  const { resolved, setMode } = useDarkMode();

  useEffect(() => {
    if (open) void pushState().then(setPush);
  }, [open]);

  const over = status === "finished" || status === "cancelled" || status === "abandoned";
  const update = (s: Settings) => (setSettings(s), saveSettings(s), onSettings(s));
  const rejoin = `${location.origin}/g/${api.gameId}#t=${api.token}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rejoin);
      setCopied(true);
    } catch {
      window.prompt(t("menu.rejoin"), rejoin);
    }
  };

  const togglePush = async () => {
    if (push === "on") {
      await disablePush(api.gameId, api.token);
      setPush("off");
    } else setPush(await enablePush(api.gameId, api.token));
  };

  const heading = panel === "art" ? t("menu.art") : t("menu.title");
  const act = () => {
    api.send(confirm === "concede" ? { type: "Concede", player: seat as 0 | 1 } : { type: "CancelGame" });
    setConfirm(null);
    setOpen(false);
  };

  return (
    <>
      <PixelIconButton label={t("menu.title")} tone="neutral" icon={<MenuIcon className="size-5" />} onClick={() => setOpen(true)} />
      <PixelDrawer open={open} onOpenChange={(o) => (setOpen(o), o || setPanel("menu"))} side="right" size="md" title={t("menu.title")}>
        <PixelDrawer.Header>
          <h2 className="pixel text-xl">{heading}</h2>
        </PixelDrawer.Header>
        <PixelDrawer.Body>
          <div className="grid gap-4">
            {panel !== "menu" && <PixelButton tone="neutral" variant="outline" onClick={() => setPanel("menu")}>{t("action.cancel")}</PixelButton>}
            {panel === "art" && (
              <ArtPicker art={art} onChange={(a) => (setArt(a), saveArt(a), api.setArt(a))} />
            )}
            {panel === "menu" && (
              <>
                <PixelButton tone="purple" className={CTA} onClick={() => setPanel("art")}>{t("menu.art")}</PixelButton>
                <PixelButton tone="neutral" variant="outline" onClick={() => (setOpen(false), openHelp("rules"))}>{t("menu.rules")}</PixelButton>
                <PixelButton tone="neutral" variant="outline" onClick={() => (setOpen(false), openHelp("keys"))}>{t("menu.keys")}</PixelButton>
                <div className="grid gap-1">
                  <PixelButton tone="neutral" variant="outline" onClick={copy}>{copied ? t("lobby.copied") : t("menu.rejoin")}</PixelButton>
                  <p className="text-sm text-muted-foreground">{t("menu.rejoinHint")}</p>
                </div>
                <div className="grid gap-1">
                  {push === "ios-needs-install" || push === "unsupported" || push === "denied" ? (
                    <p role="status" className="text-sm">{push === "ios-needs-install" ? t("menu.notificationsIos") : push === "denied" ? t("menu.notificationsDenied") : t("menu.notificationsUnsupported")}</p>
                  ) : null}
                  <PixelButton tone="neutral" variant="outline" onClick={togglePush}>{push === "on" ? t("menu.notificationsOn") : t("menu.notifications")}</PixelButton>
                </div>
                <div className="grid gap-3 rounded-xl border bg-card p-3">
                  <PixelSwitch label={t("menu.sound")} checked={settings.sound} onChange={(v) => update({ ...settings, sound: v })} />
                  <PixelSwitch label={t("menu.vibration")} checked={settings.vibration} onChange={(v) => update({ ...settings, vibration: v })} />
                  <div role="group" aria-label={t("menu.anim")} className="grid gap-2">
                    <span className="text-sm font-medium">{t("menu.anim")}</span>
                    <div className="grid grid-cols-4 gap-2">
                      {(["off", "fast", "normal", "slow"] as AnimSpeed[]).map((a) => (
                        <PixelButton key={a} tone="purple" size="sm" variant={settings.anim === a ? "solid" : "outline"} aria-pressed={settings.anim === a} onClick={() => update({ ...settings, anim: a })}>{t(`anim.${a}` as Key)}</PixelButton>
                      ))}
                    </div>
                  </div>
                  <PixelSwitch label={t("menu.dark")} checked={resolved === "dark"} onChange={(v) => setMode(v ? "dark" : "light")} />
                </div>
                {!over && status === "active" && (
                  <>
                    <PixelButton tone="red" variant="outline" onClick={() => setConfirm("concede")}>{t("menu.concede")}</PixelButton>
                    <PixelButton tone="red" variant="outline" onClick={() => setConfirm("cancel")}>{t("menu.cancelGame")}</PixelButton>
                  </>
                )}
                {status === "waiting" && <p className="text-sm">{t("lobby.waiting")}</p>}
                <PixelButton tone="neutral" variant="ghost" onClick={() => nav("/about")}>{t("menu.about")}</PixelButton>
                <PixelButton tone="neutral" variant="ghost" onClick={() => nav("/")}>{t("menu.home")}</PixelButton>
              </>
            )}
          </div>
        </PixelDrawer.Body>
      </PixelDrawer>

      <PixelAlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "concede" ? t("menu.concede") : t("menu.cancelGame")}
        description={confirm === "concede" ? t("menu.confirmConcede") : t("menu.confirmCancel")}
        cancelLabel={t("common.no")}
        actionLabel={t("common.yes")}
        destructive
        onAction={act}
      />
    </>
  );
}
