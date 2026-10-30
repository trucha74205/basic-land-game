import { describe, expect, it } from "vitest";
import { createGame, getDecision, getLegalActions, IllegalActionError, applyAction, LAND_TYPES } from "../src";
import { setup } from "./helpers";

describe("Setup and turn structure", () => {
  it("R-02 R-04 R-05: default game setup", () => {
    const g = createGame({ seed: 1 });
    for (const p of [0, 1] as const) {
      const ps = g.players[p];
      expect(ps.hand).toHaveLength(5);
      // first player has not drawn yet; second player has not either (turn 1)
      expect(ps.library).toHaveLength(45);
      const all = [...ps.hand, ...ps.library];
      expect(all).toHaveLength(50);
      for (const t of LAND_TYPES) expect(all.filter((c) => c.type === t)).toHaveLength(10);
    }
  });

  it("R-03: half deck option", () => {
    const g = createGame({ seed: 1, deckSize: "half" });
    for (const p of [0, 1] as const) {
      const all = [...g.players[p].hand, ...g.players[p].library];
      expect(g.players[p].library).toHaveLength(20);
      expect(all).toHaveLength(25);
      for (const t of LAND_TYPES) expect(all.filter((c) => c.type === t)).toHaveLength(5);
    }
  });

  it("R-04: same seed gives the same game, different seed differs", () => {
    const a = createGame({ seed: "abc" });
    const b = createGame({ seed: "abc" });
    const c = createGame({ seed: "xyz" });
    expect(a).toEqual(b);
    expect(a.players[0].hand).not.toEqual(c.players[0].hand);
  });

  it("R-06: firstPlayer config is respected", () => {
    expect(createGame({ firstPlayer: 1 }).active).toBe(1);
    expect(createGame({ firstPlayer: 0 }).active).toBe(0);
  });

  it("R-11: first player skips the first draw", () => {
    const g0 = createGame({ seed: 5, firstPlayer: 0 });
    expect(g0.players[0].hand).toHaveLength(5);
    const g1 = applyAction(g0, { type: "EndTurn" }).game;
    expect(g1.active).toBe(1);
    expect(g1.players[1].hand).toHaveLength(6);
    const g2 = applyAction(g1, { type: "EndTurn" }).game;
    expect(g2.active).toBe(0);
    expect(g2.players[0].hand).toHaveLength(6);
  });

  it("R-12: only one land drop per turn", () => {
    const s = setup({ hands: [["Island", "Island"]] }).play("Island");
    expect(s.g.landDropUsed).toBe(true);
    expect(getLegalActions(s.g).some((a) => a.type === "PlayLand")).toBe(false);
    expect(() => s.play("Island")).toThrow(IllegalActionError);
  });

  it("R-12: playing no land is allowed", () => {
    const s = setup({ hands: [["Island"]] }).endTurn();
    expect(s.g.active).toBe(1);
    expect(getDecision(s.g)).toEqual({ type: "MainPhase", player: 1 });
  });

  it("R-12: land drop resets on the next own turn", () => {
    const s = setup({ hands: [["Island", "Island"]] }).play("Island").endTurn().endTurn();
    expect(s.g.landDropUsed).toBe(false);
    expect(s.g.active).toBe(0);
  });
});
