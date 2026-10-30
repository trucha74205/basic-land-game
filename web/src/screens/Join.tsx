import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, getInvite, joinGame } from "@/lib/api";
import { t } from "@/lib/i18n";
import { getNickname, saveNickname, saveSession } from "@/lib/session";
import { PixelButton, PixelCard, PixelInput } from "@pxlkit/ui-kit";
import { CTA } from "@/lib/ui";
import { Shell } from "@/components/Shell";

export function Join() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ creatorNickname: string; full: boolean } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [nick, setNick] = useState(getNickname());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInvite(code)
      .then(setInfo)
      .catch((e: ApiError) => setProblem(e.status === 404 ? t("join.notFound") : t("error.generic")));
  }, [code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const g = await joinGame(code, nick.trim());
      saveNickname(nick.trim());
      saveSession(g.gameId, { token: g.token, seat: 1, nickname: nick.trim() });
      nav(`/g/${g.gameId}`);
    } catch (err) {
      setProblem((err as ApiError).status === 409 ? t("join.full") : t("error.generic"));
      setBusy(false);
    }
  };

  return (
    <Shell>
      {problem && <p role="alert">{problem}</p>}
      {info?.full && <p role="alert">{t("join.full")}</p>}
      {info && !info.full && (
        <form onSubmit={submit} className="grid gap-4">
          <PixelCard title={t("join.title", { name: info.creatorNickname })}>
            <PixelInput label={t("home.nickname")} value={nick} maxLength={20} required onChange={(e) => setNick(e.target.value)} />
          </PixelCard>
          <PixelButton type="submit" tone="purple" className={CTA} size="lg" fullWidth loading={busy} disabled={busy || !nick.trim()}>{t("join.go")}</PixelButton>
        </form>
      )}
      <Link to="/" className="text-center text-sm text-muted-foreground underline">{t("menu.home")}</Link>
    </Shell>
  );
}
