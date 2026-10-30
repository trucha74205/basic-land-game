import type { Action, Card, Decision, Game, PlayerId } from "./types";

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function getDecision(game: Game): Decision | null {
  const p = game.pending;
  switch (p.kind) {
    case "main":
      return { type: "MainPhase", player: game.active };
    case "counterWindow":
      return { type: "CounterWindow", player: p.player };
    case "choice":
      return { type: "ResolutionChoice", player: p.player, choice: p.choice, options: p.options };
    case "over":
      return null;
  }
}

export function getLegalActions(game: Game): Action[] {
  if (game.result) return [];
  const actions: Action[] = [];
  const p = game.pending;

  if (p.kind === "main") {
    const me = game.players[game.active];
    const opp = game.players[other(game.active)];
    if (!game.landDropUsed) {
      for (const card of me.hand) {
        const targets: Card[] =
          card.type === "Plains"
            ? me.battlefield.filter((c) => c.type !== "Plains")
            : card.type === "Mountain"
              ? opp.battlefield
              : card.type === "Forest"
                ? me.graveyard
                : [];
        if (targets.length === 0) {
          actions.push({ type: "PlayLand", card: card.id });
        } else {
          for (const t of targets) actions.push({ type: "PlayLand", card: card.id, target: t.id });
        }
      }
    }
    actions.push({ type: "EndTurn" });
  } else if (p.kind === "counterWindow") {
    const hand = game.players[p.player].hand;
    actions.push({ type: "PassCounter" });
    for (const island of hand.filter((c) => c.type === "Island")) {
      for (const o of hand) {
        if (o.id !== island.id) actions.push({ type: "Counter", island: island.id, other: o.id });
      }
    }
  } else if (p.kind === "choice") {
    for (const c of p.options) actions.push({ type: "ChooseTarget", card: c.id });
  }

  // R-83
  actions.push({ type: "Concede", player: 0 }, { type: "Concede", player: 1 }, { type: "CancelGame" });
  return actions;
}

export function actionKey(a: Action): string {
  switch (a.type) {
    case "PlayLand":
      return `PlayLand|${a.card}|${a.target ?? ""}`;
    case "Counter":
      return `Counter|${a.island}|${a.other}`;
    case "ChooseTarget":
      return `ChooseTarget|${a.card}`;
    case "Concede":
      return `Concede|${a.player}`;
    default:
      return a.type;
  }
}
