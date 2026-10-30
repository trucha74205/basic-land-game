import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PixelButton, PixelCard, PixelInput, PixelSelect } from "@pxlkit/ui-kit";
import { ApiError, createGame, getGameSummary, joinGame, listOpenGames } from "@/lib/api";
import type { GameSummary, OpenGame, Options } from "@/lib/api";
import { t } from "@/lib/i18n";
import { forgetSession, getNickname, getSessions, saveNickname, saveSession } from "@/lib/session";
import { CTA } from "@/lib/ui";
import { Shell } from "@/components/Shell";

/** One line telling a joiner what the host chose. */
export function describeOptions(o: Options): string {
  return [
    t(o.deckSize === "full" ? "home.opt.deck.full" : "home.opt.deck.half"),
    t(o.emptyLibrary === "lose" ? "home.opt.empty.lose" : "home.opt.empty.reshuffle"),
    o.maxTurns ? t("home.opt.turns", { n: o.maxTurns }) : t("home.opt.noTurns"),
    t(o.firstPlayer === "random" ? "home.opt.first.random" : o.firstPlayer === "me" ? "home.opt.first.host" : "home.opt.first.you"),
  ].join(", ");
}

/** Status of each saved game; finished games are left out of the start screen, deleted ones are forgotten. */
function useSessionSummaries(ids: string[]): Record<string, GameSummary> {
  const [found, setFound] = useState<Record<string, GameSummary>>({});
  const key = ids.join(",");
  useEffect(() => {
    let live = true;
    const all = getSessions();
    ids.forEach((id) =>
      getGameSummary(id, all[id]!.token)
        .then((sum) => live && setFound((f) => ({ ...f, [id]: sum })))
        .catch((e) => {
          if (e instanceof ApiError && (e.status === 401 || e.status === 404)) forgetSession(id);
        }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return found;
}

export function Home() {
  const nav = useNavigate();
  const [nick, setNick] = useState(getNickname());
  const [opts, setOpts] = useState<Options>({ deckSize: "full", emptyLibrary: "lose", maxTurns: null, firstPlayer: "random" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = Object.entries(getSessions()).sort((a, b) => b[1].savedAt - a[1].savedAt);
  const summaries = useSessionSummaries(saved.map(([id]) => id));
  const sessions = saved.filter(([id]) => summaries[id] && summaries[id]!.status !== "finished");
  const [open, setOpen] = useState<OpenGame[]>([]);
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    const load = () => listOpenGames().then((g) => setOpen((old) => (JSON.stringify(old) === JSON.stringify(g) ? old : g)), () => undefined);
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);
  // games the player created or asked to join are listed under their own games instead
  const mine = new Set(saved.map(([, s]) => s.code).filter(Boolean));
  const joinable = open.filter((g) => !mine.has(g.code));

  const ask = async (g: OpenGame) => {
    setAsking(g.code);
    setError(null);
    try {
      const r = await joinGame(g.code, nick.trim(), true);
      saveNickname(nick.trim());
      saveSession(r.gameId, { token: r.token, seat: 1, nickname: nick.trim() });
      nav(`/g/${r.gameId}`);
    } catch (err) {
      setError((err as ApiError).status === 409 ? t("join.full") : (err as Error).message || t("error.generic"));
      setAsking(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const g = await createGame(nick.trim(), opts);
      saveNickname(nick.trim());
      saveSession(g.gameId, { token: g.token, seat: 0, nickname: nick.trim(), code: g.code });
      nav(`/g/${g.gameId}`);
    } catch (err) {
      setError((err as Error).message || t("error.generic"));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="grid gap-4">
      <PixelCard>
        <PixelInput label={t("home.nickname")} value={nick} maxLength={20} required onChange={(e) => setNick(e.target.value)} autoComplete="nickname" form="create" />
      </PixelCard>
      <section aria-label={t("home.open")} className="grid gap-2 p-2">
        <h2 className="pixel text-xl">{t("home.open")}</h2>
        {joinable.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("home.openEmpty")}</p>
        ) : (
          <ul className="grid gap-2">
            {joinable.map((g) => (
              <li key={g.code} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t("home.openHost", { name: g.creatorNickname })}</p>
                  <p className="text-sm text-muted-foreground">{describeOptions(g.options)}</p>
                </div>
                <PixelButton tone="purple" className={CTA} loading={asking === g.code} disabled={!nick.trim() || asking !== null} onClick={() => ask(g)}>{t("home.ask")}</PixelButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form id="create" onSubmit={submit} className="grid gap-4">
        <PixelCard title={t("home.options")}>
          <div className="grid gap-4">
            <PixelSelect
              label={t("home.deckSize")}
              value={opts.deckSize}
              onChange={(v) => setOpts({ ...opts, deckSize: v as Options["deckSize"] })}
              options={[{ value: "full", label: t("home.deck.full") }, { value: "half", label: t("home.deck.half") }]}
            />
            <PixelSelect
              label={t("home.emptyLibrary")}
              value={opts.emptyLibrary}
              onChange={(v) => setOpts({ ...opts, emptyLibrary: v as Options["emptyLibrary"] })}
              options={[{ value: "lose", label: t("home.empty.lose") }, { value: "reshuffle", label: t("home.empty.reshuffle") }]}
            />
            <PixelInput label={t("home.maxTurns")} type="number" inputMode="numeric" min={1} max={1000} value={opts.maxTurns ?? ""} onChange={(e) => setOpts({ ...opts, maxTurns: e.target.value ? Number(e.target.value) : null })} />
            <PixelSelect
              label={t("home.firstPlayer")}
              value={opts.firstPlayer}
              onChange={(v) => setOpts({ ...opts, firstPlayer: v as Options["firstPlayer"] })}
              options={[{ value: "random", label: t("home.first.random") }, { value: "me", label: t("home.first.me") }, { value: "opponent", label: t("home.first.opponent") }]}
            />
          </div>
        </PixelCard>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <PixelButton type="submit" tone="purple" className={CTA} size="lg" fullWidth loading={busy} disabled={busy || !nick.trim()}>{t("home.create")}</PixelButton>
      </form>
      </div>

      {sessions.length > 0 && (
        <section aria-label={t("home.resume")} className="grid gap-2">
          <h2 className="pixel text-xl">{t("home.resume")}</h2>
          <ul className="grid gap-2">
            {sessions.map(([id, s]) => (
              <li key={id}>
                <Link to={`/g/${id}`} className="block rounded-xl border bg-card p-3 no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="font-medium">{summaries[id]!.opponent ? t("home.vs", { name: summaries[id]!.opponent! }) : t("home.waitingGame")}</span> <span className="text-sm text-muted-foreground">{new Date(s.savedAt).toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link to="/about" className="text-center text-sm text-muted-foreground underline">{t("menu.about")}</Link>
    </Shell>
  );
}
