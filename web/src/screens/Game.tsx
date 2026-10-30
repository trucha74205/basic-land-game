import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Action } from "basic-land-engine";
import type { ArtChoice } from "@/lib/art";
import { cueFor, pendingCue, playCue, titleFor } from "@/lib/cues";
import { t } from "@/lib/i18n";
import { forgetSession, getArt, getSession, getSettings, saveSession, takeTokenFromHash } from "@/lib/session";
import type { Settings } from "@/lib/session";
import { GameConnection } from "@/lib/socket";
import { useGame } from "@/lib/store";
import { PixelBadge, PixelButton, PixelCard, PixelInput } from "@pxlkit/ui-kit";
import { GameCtx } from "@/components/GameContext";
import { Menu } from "@/components/Menu";
import { Result } from "@/components/Result";
import { HelpHost } from "@/components/Help";
import { Table } from "@/components/Table";
import { CTA } from "@/lib/ui";

const BASE_TITLE = "Basic Land Game";

export function GameScreen() {
  const { gameId = "" } = useParams();
  const nav = useNavigate();
  // a rejoin link carries the token in the fragment (W-13); store it and clear the address bar
  const token = useMemo(() => {
    const fromHash = takeTokenFromHash(window.location.hash);
    if (fromHash) {
      saveSession(gameId, { token: fromHash, seat: getSession(gameId)?.seat ?? 0, nickname: getSession(gameId)?.nickname ?? "" });
      window.history.replaceState(null, "", `/g/${gameId}`);
      return fromHash;
    }
    return getSession(gameId)?.token ?? null;
  }, [gameId]);

  const conn = useRef<GameConnection | null>(null);
  const settings = useRef<Settings>(getSettings());
  const game = useGame();

  useEffect(() => {
    if (!token) return;
    useGame.getState().reset();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const c = new GameConnection({
      url: `${proto}://${location.host}/ws`,
      gameId,
      token,
      getLastVersion: () => (useGame.getState().gameId === gameId ? useGame.getState().version : undefined),
      isVisible: () => !document.hidden,
      onStatus: (s) => useGame.getState().setConn(s),
      onMessage: (m) => {
        useGame.getState().apply(m);
        if (m.t === "snapshot") {
          saveSession(gameId, { token, seat: m.seat, nickname: m.seats.find((s: { seat: number }) => s.seat === m.seat)?.nickname ?? "", code: getSession(gameId)?.code });
          const art = getArt();
          if (Object.keys(art).length > 0) c.send({ t: "art", art });
        }
      },
    });
    conn.current = c;
    c.start();
    const vis = () => c.sendVisibility(!document.hidden);
    const online = () => c.nudge();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("online", online);
      c.stop();
      conn.current = null;
    };
  }, [gameId, token]);

  // cues (W-50, W-51)
  useEffect(() => {
    if (game.seat === null) return;
    const cue = cueFor(game.view, game.legal, game.fresh, game.seat);
    if (cue) playCue(cue, settings.current);
  }, [game.version]);
  const pending = game.seat === null ? null : pendingCue(game.view, game.legal, game.seat);
  useEffect(() => {
    const apply = () => (document.title = document.hidden ? titleFor(pending, BASE_TITLE) : BASE_TITLE);
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => {
      document.removeEventListener("visibilitychange", apply);
      document.title = BASE_TITLE;
    };
  }, [pending]);

  // a rematch starts a new game in the same room with the same seat token (W-40)
  useEffect(() => {
    const next = game.rematch.nextGameId;
    if (next && token && game.seat !== null) {
      const s = getSession(gameId);
      saveSession(next, { token, seat: game.seat, nickname: s?.nickname ?? "" });
      nav(`/g/${next}`);
    }
  }, [game.rematch.nextGameId]);

  const send = useCallback(
    (action: Action) => {
      const v = useGame.getState().version;
      if (v !== undefined) conn.current?.send({ t: "action", version: v, action });
    },
    [],
  );
  const api = useMemo(
    () => ({
      send,
      setArt: (art: ArtChoice) => void conn.current?.send({ t: "art", art }),
      rematch: () => void conn.current?.send({ t: "rematch" }),
      accept: () => void conn.current?.send({ t: "accept" }),
      kick: () => void conn.current?.send({ t: "kick" }),
      gameId,
      token: token ?? "",
    }),
    [send, gameId, token],
  );

  if (!token) {
    return (
      <main className="mx-auto grid max-w-md gap-4 p-4">
        <p role="alert">{t("conn.denied")}</p>
        <Link to="/" className="underline">{t("menu.home")}</Link>
      </main>
    );
  }
  if (game.conn === "denied") {
    return (
      <main className="mx-auto grid max-w-md gap-4 p-4">
        <p role="alert">{t("conn.denied")}</p>
        <PixelButton tone="purple" className={CTA} onClick={() => (forgetSession(gameId), nav("/"))}>{t("menu.home")}</PixelButton>
      </main>
    );
  }

  const opp = game.seats.find((s) => s.seat !== game.seat);
  const guest = game.seats.find((s) => s.seat === 1 && s.pending);
  const code = getSession(gameId)?.code;
  const invite = code ? `${location.origin}/j/${code}` : null;

  return (
    <GameCtx.Provider value={api}>
      <div className="page-glow min-h-dvh">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/80 px-4 py-2 backdrop-blur">
          <Link to="/" className="brand text-xl no-underline" aria-label={t("menu.home")}>BLG</Link>
          <h1 className="pixel min-w-0 flex-1 truncate text-lg">{game.status === "waiting" ? t("lobby.title") : opp?.nickname ?? BASE_TITLE}</h1>
          {game.conn !== "open" && <PixelBadge tone="red" variant="solid">{game.conn === "reconnecting" ? t("conn.reconnecting") : "..."}</PixelBadge>}
          {game.seat !== null && <Menu onSettings={(s) => (settings.current = s)} />}
        </header>
        {game.status === "waiting" && (
          <main className="mx-auto grid max-w-md gap-4 p-4 pt-10">
            <PixelCard title={t("lobby.title")}>
              <div className="grid gap-3">
                {guest && game.seat === 0 ? (
                  <>
                    <p role="status" className="text-lg">{t("lobby.request", { name: guest.nickname })}</p>
                    <div className="flex gap-3">
                      <PixelButton tone="neutral" variant="outline" fullWidth onClick={api.kick}>{t("lobby.kick")}</PixelButton>
                      <PixelButton tone="purple" className={CTA} fullWidth onClick={api.accept}>{t("lobby.accept")}</PixelButton>
                    </div>
                  </>
                ) : game.seat === 1 ? (
                  <p role="status" className="text-lg">{t("lobby.awaitHost")}</p>
                ) : (
                  <p className="text-lg">{t("lobby.waiting")}</p>
                )}
                {invite && !guest && game.seat === 0 && (
                  <>
                    <PixelInput readOnly label={t("lobby.invite")} value={invite} onFocus={(e) => e.currentTarget.select()} />
                    <PixelButton tone="purple" className={CTA} onClick={() => navigator.clipboard?.writeText(invite)}>{t("lobby.copy")}</PixelButton>
                  </>
                )}
              </div>
            </PixelCard>
          </main>
        )}
        {game.view && game.status !== "waiting" && <Table />}
        <HelpHost />
        {game.seat !== null && <Result onRematchGame={(id) => nav(`/g/${id}`)} />}
      </div>
    </GameCtx.Provider>
  );
}
