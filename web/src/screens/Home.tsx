import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PixelButton, PixelCard, PixelInput, PixelSelect } from "@pxlkit/ui-kit";
import { createGame } from "@/lib/api";
import type { Options } from "@/lib/api";
import { t } from "@/lib/i18n";
import { getNickname, getSessions, saveNickname, saveSession } from "@/lib/session";
import { CTA } from "@/lib/ui";
import { Shell } from "@/components/Shell";

export function Home() {
  const nav = useNavigate();
  const [nick, setNick] = useState(getNickname());
  const [opts, setOpts] = useState<Options>({ deckSize: "full", emptyLibrary: "lose", maxTurns: null, firstPlayer: "random" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessions = Object.entries(getSessions()).sort((a, b) => b[1].savedAt - a[1].savedAt);

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
      <form onSubmit={submit} className="grid gap-4">
        <PixelCard>
          <PixelInput label={t("home.nickname")} value={nick} maxLength={20} required onChange={(e) => setNick(e.target.value)} autoComplete="nickname" />
        </PixelCard>
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

      {sessions.length > 0 && (
        <section aria-label={t("home.resume")} className="grid gap-2">
          <h2 className="pixel text-xl">{t("home.resume")}</h2>
          <ul className="grid gap-2">
            {sessions.map(([id, s]) => (
              <li key={id}>
                <Link to={`/g/${id}`} className="block rounded-xl border bg-card p-3 no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <span className="font-medium">{s.nickname}</span> <span className="text-sm text-muted-foreground">{new Date(s.savedAt).toLocaleString()}</span>
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
