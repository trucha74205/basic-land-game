import { describe, expect, it } from "vitest";
import { createGame, getDecision, getLegalActions, applyAction } from "../src";
import { L, setup } from "./helpers";

describe("Island counter and the stack", () => {
  it("R-30 R-33: Island plus another land counters a land drop", () => {
    const s = setup({
      hands: [["Mountain"], ["Island", "Swamp"]],
      battlefields: [[], ["Forest"]],
    }).play("Mountain", { p: 1, zone: "battlefield", type: "Forest" });
    expect(getDecision(s.g)).toEqual({ type: "CounterWindow", player: 1 });
    s.counter(1);
    // player 0 holds nothing: no counter-window, stack resolves
    expect(s.has(0, "graveyard", "Mountain")).toBe(true);
    expect(s.has(0, "battlefield", "Mountain")).toBe(false);
    expect(s.has(1, "battlefield", "Forest")).toBe(true); // effect did not happen
    expect(s.count(1, "graveyard")).toBe(2); // Island + Swamp paid
    expect(s.events.some((e) => e.type === "LandCountered")).toBe(true);
  });

  it("R-34: the counter window always opens, with only pass available when no counter is possible", () => {
    for (const hand of [["Island"], ["Swamp", "Mountain"], []] as const) {
      const s = setup({ hands: [["Plains"], [...hand]] }).raw({ type: "PlayLand", card: "t0-hand-0-Plains" });
      expect(getDecision(s.g)).toEqual({ type: "CounterWindow", player: 1 });
      const legal = getLegalActions(s.g).filter((a) => a.type !== "Concede" && a.type !== "CancelGame");
      expect(legal).toEqual([{ type: "PassCounter" }]);
      s.raw({ type: "PassCounter" });
      expect(s.has(0, "battlefield", "Plains")).toBe(true);
    }
  });

  it("R-34: the active player also gets a window after a counter", () => {
    const s = setup({ hands: [["Plains"], ["Island", "Swamp"]] }).raw({ type: "PlayLand", card: "t0-hand-0-Plains" });
    s.raw({ type: "Counter", island: s.id(1, "hand", "Island"), other: s.id(1, "hand", "Swamp") });
    expect(getDecision(s.g)).toEqual({ type: "CounterWindow", player: 0 });
    expect(getLegalActions(s.g).filter((a) => a.type === "PassCounter")).toHaveLength(1);
  });

  it("R-30: two Islands can counter (one pays as the other land)", () => {
    const s = setup({ hands: [["Plains"], ["Island", "Island"]] }).play("Plains").counter(1);
    expect(s.has(0, "graveyard", "Plains")).toBe(true);
    expect(s.count(1, "graveyard", "Island")).toBe(2);
  });

  it("R-14: a countered land drop uses up the land drop", () => {
    const s = setup({ hands: [["Plains", "Island"], ["Island", "Swamp"]] }).play("Plains").counter(1);
    expect(s.g.landDropUsed).toBe(true);
    expect(getLegalActions(s.g).some((a) => a.type === "PlayLand")).toBe(false);
  });

  it("R-32 R-33: counter is countered and the land drop resolves", () => {
    const s = setup({
      hands: [["Mountain", "Island", "Swamp"], ["Island", "Forest"]],
      battlefields: [[], ["Forest"]],
    }).play("Mountain", { p: 1, zone: "battlefield", type: "Forest" });
    s.counter(1);
    expect(getDecision(s.g)).toEqual({ type: "CounterWindow", player: 0 });
    s.counter(0);
    // player 1 has no more cards: stack resolves, Mountain enters, effect resolves
    expect(s.has(0, "battlefield", "Mountain")).toBe(true);
    expect(s.has(1, "graveyard", "Forest")).toBe(true);
    expect(s.eventTypes().filter((t) => t === "CounterCast")).toHaveLength(2);
  });

  it("R-32 R-33: unanswered counter negates the land drop (player passes)", () => {
    const s = setup({
      hands: [["Plains", "Island", "Swamp"], ["Island", "Forest"]],
    }).play("Plains");
    s.counter(1);
    expect(getDecision(s.g)).toEqual({ type: "CounterWindow", player: 0 });
    s.pass();
    expect(s.has(0, "graveyard", "Plains")).toBe(true);
    expect(s.has(0, "battlefield", "Plains")).toBe(false);
  });

  it("R-32: a chain of three counters ends with the land countered", () => {
    const s = setup({
      hands: [["Plains", "Island", "Swamp"], ["Island", "Forest", "Island", "Mountain"]],
    }).play("Plains");
    s.counter(1, "Forest");
    s.counter(0, "Swamp");
    s.counter(1, "Mountain");
    expect(s.eventTypes().filter((t) => t === "CounterCast")).toHaveLength(3);
    expect(s.has(0, "graveyard", "Plains")).toBe(true);
  });

  it("R-31: counters can be used on several turns", () => {
    const s = setup({
      hands: [L("Plains", 2), L("Island", 4)],
    })
      .play("Plains")
      .counter(1)
      .endTurn()
      .endTurn()
      .play("Plains")
      .counter(1);
    expect(s.count(0, "graveyard", "Plains")).toBe(2);
  });

  it("R-35: the counter window belongs to the non-active player", () => {
    const s = setup({ hands: [["Plains", "Island", "Swamp"], ["Island", "Forest"]] }).play("Plains");
    expect(getDecision(s.g)).toEqual({ type: "CounterWindow", player: 1 });
  });
});

describe("Winning", () => {
  it("R-60: Domain win", () => {
    const s = setup({
      hands: [["Forest"]],
      battlefields: [["Plains", "Island", "Swamp", "Mountain"]],
    }).play("Forest");
    expect(s.g.result).toEqual({ kind: "win", player: 0, condition: "Domain" });
    expect(getDecision(s.g)).toBeNull();
    expect(getLegalActions(s.g)).toEqual([]);
  });

  it("R-60: Mono win", () => {
    const s = setup({ hands: [["Mountain"]], battlefields: [L("Mountain", 4)] }).play("Mountain");
    expect(s.g.result).toEqual({ kind: "win", player: 0, condition: "Mono" });
  });

  it("R-60: four of a kind is not enough", () => {
    const s = setup({ hands: [["Mountain"]], battlefields: [L("Mountain", 3)] }).play("Mountain");
    expect(s.g.result).toBeNull();
  });

  it("R-24: the win is checked before the entering land's effect", () => {
    const s = setup({
      hands: [["Forest"]],
      battlefields: [["Plains", "Island", "Swamp", "Mountain"]],
      graveyards: [["Swamp"]],
    }).play("Forest", { p: 0, zone: "graveyard", type: "Swamp" });
    expect(s.g.result).toMatchObject({ kind: "win" });
    expect(s.eventTypes()).not.toContain("LandReturned");
  });

  it("R-60: a countered land does not win the game", () => {
    const s = setup({ hands: [["Mountain"], ["Island", "Swamp"]], battlefields: [L("Mountain", 4)] }).play("Mountain").counter(1);
    expect(s.g.result).toBeNull();
    expect(s.count(0, "battlefield", "Mountain")).toBe(4);
  });

  it("R-60: Plains completes a Domain before its copy effect resolves", () => {
    const s = setup({ hands: [["Plains"]], battlefields: [["Island", "Swamp", "Mountain", "Forest"]] }).play("Plains", {
      p: 0,
      zone: "battlefield",
      type: "Island",
    });
    expect(s.count(0, "hand")).toBe(0);
    expect(s.g.result).toMatchObject({ kind: "win", condition: "Domain" });
  });

  it("R-61: the active player wins if both qualify (unreachable in play, so the stack is built by hand)", () => {
    const s = setup({
      hands: [["Forest"]],
      battlefields: [["Plains", "Island", "Swamp", "Mountain"], ["Plains", "Island", "Swamp", "Mountain", "Forest"]],
    });
    const forest = s.g.players[0].hand.splice(0, 1)[0]!;
    s.g.stack = [{ kind: "landDrop", player: 0, card: forest }];
    s.g.pending = { kind: "counterWindow", player: 1 };
    s.raw({ type: "PassCounter" });
    expect(s.g.result).toMatchObject({ kind: "win", player: 0, condition: "Domain" });
  });
});

describe("Library, turn limit, concede, cancel", () => {
  it("R-70: empty library loses by default", () => {
    const s = setup({ libraries: [[], []] }).endTurn();
    expect(s.g.result).toEqual({ kind: "win", player: 0, condition: "EmptyLibrary" });
  });

  it("R-70: Island with an empty library loses", () => {
    const s = setup({ hands: [["Island"]], libraries: [[], []] }).play("Island");
    expect(s.g.result).toEqual({ kind: "win", player: 1, condition: "EmptyLibrary" });
  });

  it("R-70: empty library reshuffles the graveyard", () => {
    const s = setup({
      graveyards: [[], ["Plains", "Island", "Swamp"]],
      libraries: [[], []],
      config: { emptyLibrary: "reshuffle" },
    }).endTurn();
    expect(s.g.result).toBeNull();
    expect(s.count(1, "hand")).toBe(1);
    expect(s.count(1, "library")).toBe(2);
    expect(s.count(1, "graveyard")).toBe(0);
    expect(s.eventTypes()).toContain("LibraryReshuffled");
  });

  it("R-70: reshuffle with an empty graveyard draws nothing", () => {
    const s = setup({ libraries: [[], []], config: { emptyLibrary: "reshuffle" } }).endTurn();
    expect(s.g.result).toBeNull();
    expect(s.count(1, "hand")).toBe(0);
    expect(getDecision(s.g)).toMatchObject({ type: "MainPhase", player: 1 });
  });

  it("R-80: game is drawn when maxTurns is reached", () => {
    let g = createGame({ firstPlayer: 0, maxTurns: 4, seed: 1 });
    for (let i = 0; i < 3; i++) g = applyAction(g, { type: "EndTurn" }).game;
    expect(g.turn).toBe(4);
    expect(g.result).toBeNull();
    g = applyAction(g, { type: "EndTurn" }).game;
    expect(g.result).toEqual({ kind: "draw", reason: "maxTurns" });
  });

  it("R-80: no turn limit by default", () => {
    let g = createGame({ firstPlayer: 0, seed: 1, deckSize: "full" });
    for (let i = 0; i < 40; i++) g = applyAction(g, { type: "EndTurn" }).game;
    expect(g.result).toBeNull();
  });

  it("R-81 R-83: concede during the opponent's counter window", () => {
    const s = setup({ hands: [["Plains"], ["Island", "Swamp"]] }).play("Plains");
    expect(getDecision(s.g)).toMatchObject({ type: "CounterWindow", player: 1 });
    s.act({ type: "Concede", player: 1 });
    expect(s.g.result).toEqual({ kind: "win", player: 0, condition: "Concede" });
  });

  it("R-81: the non-deciding player can concede too", () => {
    const s = setup().act({ type: "Concede", player: 0 });
    expect(s.g.result).toEqual({ kind: "win", player: 1, condition: "Concede" });
  });

  it("R-82 R-83: cancel ends the game without a winner", () => {
    const s = setup().act({ type: "CancelGame" });
    expect(s.g.result).toEqual({ kind: "cancelled" });
    expect(() => s.endTurn()).toThrow();
  });
});

describe("Engine properties", () => {
  it("applyAction does not mutate its input", () => {
    const g = createGame({ seed: 3 });
    const before = structuredClone(g);
    applyAction(g, { type: "EndTurn" });
    expect(g).toEqual(before);
  });

  it("random legal play always terminates, conserves cards and never throws", () => {
    for (let seed = 0; seed < 200; seed++) {
      const config = { seed, deckSize: seed % 2 ? ("half" as const) : ("full" as const) };
      let g = createGame({ ...config, emptyLibrary: seed % 3 ? "lose" : "reshuffle", maxTurns: 400 });
      let r = seed * 7919 + 1;
      const rand = (n: number) => {
        r = (Math.imul(r, 1103515245) + 12345) >>> 0;
        return r % n;
      };
      let steps = 0;
      while (!g.result && steps++ < 5000) {
        const legal = getLegalActions(g).filter((a) => a.type !== "Concede" && a.type !== "CancelGame");
        g = applyAction(g, legal[rand(legal.length)]!).game;
        for (const p of [0, 1] as const) {
          const ps = g.players[p];
          const inStack = g.stack.filter((s) => s.kind === "landDrop" && s.player === p).length;
          const total = ps.library.length + ps.hand.length + ps.graveyard.length + ps.battlefield.length + inStack;
          expect(total).toBe(config.deckSize === "full" ? 50 : 25);
        }
      }
      expect(g.result).not.toBeNull();
    }
  });
});
