import { describe, expect, it } from "vitest";
import { IllegalActionError, getDecision, getEvents, getLegalActions, getView } from "../src";
import { L, setup } from "./helpers";

describe("Land entry effects", () => {
  it("R-41: Island draws a card", () => {
    const s = setup({ hands: [["Island"]] }).play("Island");
    expect(s.has(0, "battlefield", "Island")).toBe(true);
    expect(s.count(0, "hand")).toBe(1);
    expect(s.count(0, "library")).toBe(9);
  });

  it("R-42: Swamp makes the opponent discard a land chosen by the caster", () => {
    const s = setup({ hands: [["Swamp"], ["Forest", "Mountain"]] }).play("Swamp");
    expect(getDecision(s.g)).toMatchObject({ type: "ResolutionChoice", player: 0, choice: "swampDiscard" });
    s.choose(1, "hand", "Mountain");
    expect(s.has(1, "graveyard", "Mountain")).toBe(true);
    expect(s.has(1, "hand", "Forest")).toBe(true);
    expect(getDecision(s.g)).toMatchObject({ type: "MainPhase" });
  });

  it("R-42 R-23: Swamp against an empty hand fizzles", () => {
    const s = setup({ hands: [["Swamp"]] }).play("Swamp");
    expect(s.has(0, "battlefield", "Swamp")).toBe(true);
    expect(s.fizzled()).toBe(true);
  });

  it("R-43: Mountain destroys a declared opposing land", () => {
    const s = setup({ hands: [["Mountain"]], battlefields: [[], ["Forest", "Island"]] }).play("Mountain", {
      p: 1,
      zone: "battlefield",
      type: "Forest",
    });
    expect(s.has(1, "graveyard", "Forest")).toBe(true);
    expect(s.has(1, "battlefield", "Forest")).toBe(false);
    expect(s.has(1, "battlefield", "Island")).toBe(true);
    expect(s.has(0, "battlefield", "Mountain")).toBe(true);
  });

  it("R-43: Mountain must declare a target when one exists", () => {
    const s = setup({ hands: [["Mountain"]], battlefields: [[], ["Forest"]] });
    expect(() => s.act({ type: "PlayLand", card: s.id(0, "hand", "Mountain") })).toThrow(IllegalActionError);
  });

  it("R-43 R-23: Mountain with no opposing lands fizzles", () => {
    const s = setup({ hands: [["Mountain"]] }).play("Mountain");
    expect(s.has(0, "battlefield", "Mountain")).toBe(true);
    expect(s.fizzled()).toBe(true);
  });

  it("R-44: Forest returns a land from the graveyard", () => {
    const s = setup({ hands: [["Forest"]], graveyards: [["Swamp"]] }).play("Forest", {
      p: 0,
      zone: "graveyard",
      type: "Swamp",
    });
    expect(s.has(0, "hand", "Swamp")).toBe(true);
    expect(s.count(0, "graveyard")).toBe(0);
  });

  it("R-44 R-23: Forest with an empty graveyard fizzles", () => {
    const s = setup({ hands: [["Forest"]] }).play("Forest");
    expect(s.has(0, "battlefield", "Forest")).toBe(true);
    expect(s.fizzled()).toBe(true);
  });

  it("R-44: Forest can return a land that Swamp discarded", () => {
    const s = setup({ hands: [["Swamp"], ["Forest"]] }).play("Swamp").choose(1, "hand", "Forest");
    expect(s.has(1, "graveyard", "Forest")).toBe(true);
  });

  it("R-40: Plains repeats the Island draw", () => {
    const s = setup({ hands: [["Plains"]], battlefields: [["Island"]] }).play("Plains", {
      p: 0,
      zone: "battlefield",
      type: "Island",
    });
    expect(s.count(0, "hand")).toBe(1);
    expect(s.has(0, "battlefield", "Plains")).toBe(true);
  });

  it("R-40 R-40b: Plains copying Mountain chooses the destroyed land at resolution", () => {
    const s = setup({
      hands: [["Plains"]],
      battlefields: [["Mountain"], ["Forest", "Swamp"]],
    }).play("Plains", { p: 0, zone: "battlefield", type: "Mountain" });
    // declared target is only the Mountain; nothing destroyed yet
    expect(s.events.find((e) => e.type === "TargetsDeclared")).toMatchObject({ target: s.id(0, "battlefield", "Mountain") });
    expect(s.count(1, "battlefield")).toBe(2);
    expect(getDecision(s.g)).toMatchObject({ type: "ResolutionChoice", choice: "mountainTarget", player: 0 });
    s.choose(1, "battlefield", "Swamp");
    expect(s.has(1, "graveyard", "Swamp")).toBe(true);
    expect(s.has(1, "battlefield", "Forest")).toBe(true);
  });

  it("R-40b: Plains copying Forest chooses the returned land at resolution", () => {
    const s = setup({ hands: [["Plains"]], battlefields: [["Forest"]], graveyards: [["Swamp", "Island"]] }).play("Plains", {
      p: 0,
      zone: "battlefield",
      type: "Forest",
    });
    expect(getDecision(s.g)).toMatchObject({ choice: "forestTarget" });
    s.choose(0, "graveyard", "Island");
    expect(s.has(0, "hand", "Island")).toBe(true);
  });

  it("R-40: Plains copying Swamp makes the opponent discard", () => {
    const s = setup({ hands: [["Plains"], ["Island"]], battlefields: [["Swamp"]] }).play("Plains", {
      p: 0,
      zone: "battlefield",
      type: "Swamp",
    });
    s.choose(1, "hand", "Island");
    expect(s.has(1, "graveyard", "Island")).toBe(true);
  });

  it("R-40a: Plains cannot target another Plains", () => {
    const s = setup({ hands: [["Plains"]], battlefields: [["Plains"]] });
    expect(() =>
      s.act({ type: "PlayLand", card: s.id(0, "hand", "Plains"), target: s.id(0, "battlefield", "Plains") }),
    ).toThrow(IllegalActionError);
    // and the only legal Plains play has no target (fizzles)
    const plays = getLegalActions(s.g).filter((a) => a.type === "PlayLand");
    expect(plays).toEqual([{ type: "PlayLand", card: s.id(0, "hand", "Plains") }]);
    s.play("Plains");
    expect(s.fizzled()).toBe(true);
  });

  it("R-40c R-23: Plains with no other non-Plains land fizzles", () => {
    const s = setup({ hands: [["Plains"]] }).play("Plains");
    expect(s.has(0, "battlefield", "Plains")).toBe(true);
    expect(s.fizzled()).toBe(true);
  });

  it("R-40d: Plains cannot reuse the Island counter ability (it only draws)", () => {
    const s = setup({ hands: [["Plains", "Island", "Swamp"], L("Forest", 3)], battlefields: [["Island"]] }).play("Plains", {
      p: 0,
      zone: "battlefield",
      type: "Island",
    });
    expect(s.count(0, "hand")).toBe(3); // 3 - played Plains + 1 draw
  });

  it("R-42a: Swamp reveal is private to the Swamp player", () => {
    const s = setup({ hands: [["Swamp"], ["Forest", "Mountain"]] }).play("Swamp");
    const reveal = (viewer: 0 | 1) => getEvents(s.g, viewer).find((e) => e.type === "HandRevealed");
    expect(reveal(0)).toMatchObject({ by: 0, of: 1 });
    expect((reveal(0) as { cards?: unknown[] }).cards).toHaveLength(2);
    expect(reveal(1)).toMatchObject({ by: 0, of: 1 });
    expect((reveal(1) as { cards?: unknown[] }).cards).toBeUndefined();
    // the choice options are hidden in the opponent's view
    expect(getView(s.g, 1).decision).toMatchObject({ type: "ResolutionChoice", options: [] });
    expect(getView(s.g, 0).decision).toMatchObject({ type: "ResolutionChoice" });
    expect((getView(s.g, 0).decision as { options: unknown[] }).options).toHaveLength(2);
  });

  it("view hides the opponent hand and libraries", () => {
    const s = setup({ hands: [["Swamp", "Island"], ["Forest", "Mountain", "Plains"]] });
    const v = getView(s.g, 0);
    expect(v.hand).toHaveLength(2);
    expect(v.opponentHandCount).toBe(3);
    expect(v.libraryCounts).toEqual([10, 10]);
    expect(JSON.stringify(v)).not.toContain("t1-hand");
  });
});
