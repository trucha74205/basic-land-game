import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Action, Card, PlayerView } from "basic-land-engine";
import { GameCtx } from "../src/components/GameContext";
import { Table, fitHand } from "../src/components/Table";
import { emptyGame, useGame } from "../src/lib/store";

const c = (id: string, type: Card["type"]): Card => ({ id, type });

function view(over: Partial<PlayerView> = {}): PlayerView {
  return {
    viewer: 0, active: 0, turn: 3, hand: [c("p0-Mountain-1", "Mountain"), c("p0-Swamp-2", "Swamp")],
    opponentHandCount: 4, libraryCounts: [40, 38], battlefields: [[c("p0-Forest-9", "Forest")], [c("p1-Plains-3", "Plains"), c("p1-Island-4", "Island")]],
    graveyards: [[], []], stack: [], decision: { type: "MainPhase", player: 0 }, result: null, ...over,
  };
}

const send = vi.fn();
function show(v: PlayerView, legal: Action[], seat: 0 | 1 = 0) {
  useGame.setState({ ...emptyGame, gameId: "g", seat, status: "active", version: 5, conn: "open", view: v, legal, seats: [
    { seat: 0, nickname: "Anna", connected: true, art: {} }, { seat: 1, nickname: "Ben", connected: true, art: {} }] });
  return render(
    <MemoryRouter>
      <GameCtx.Provider value={{ send, setArt: vi.fn(), rematch: vi.fn(), accept: vi.fn(), kick: vi.fn(), gameId: "g", token: "t" }}>
        <Table />
      </GameCtx.Provider>
    </MemoryRouter>,
  );
}

const UI_ONLY: Action[] = [{ type: "Concede", player: 0 }, { type: "CancelGame" }];
beforeEach(() => send.mockClear());

describe("table (W-31 to W-36)", () => {
  it("W-32 states what is happening and offers End turn on my turn", () => {
    show(view(), [{ type: "PlayLand", card: "p0-Swamp-2" }, { type: "EndTurn" }, ...UI_ONLY]);
    expect(screen.getByRole("status")).toHaveTextContent("Your turn: play a land or end the turn");
    fireEvent.click(screen.getByRole("button", { name: "End turn" }));
    expect(send).toHaveBeenCalledWith({ type: "EndTurn" });
  });

  it("W-33 a land without targets is confirmed directly; only legal cards are selectable", () => {
    show(view(), [{ type: "PlayLand", card: "p0-Swamp-2" }, { type: "EndTurn" }, ...UI_ONLY]);
    fireEvent.click(screen.getByRole("button", { name: /Mountain, in hand/ })); // not legal: only zooms
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /Swamp, in hand/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Play Swamp?");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(send).toHaveBeenCalledWith({ type: "PlayLand", card: "p0-Swamp-2" });
  });

  it("W-33 a land with targets needs one tapped target before Confirm works", () => {
    show(view(), [
      { type: "PlayLand", card: "p0-Mountain-1", target: "p1-Plains-3" },
      { type: "PlayLand", card: "p0-Mountain-1", target: "p1-Island-4" },
      { type: "EndTurn" }, ...UI_ONLY,
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Mountain, in hand/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Pick a target for Mountain");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Forest, on battlefield$/ })).not.toHaveAccessibleName(/select/);
    fireEvent.click(screen.getByRole("button", { name: /Island, on battlefield, select/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(send).toHaveBeenCalledWith({ type: "PlayLand", card: "p0-Mountain-1", target: "p1-Island-4" });
  });

  it("W-34 shows the counter dialog with Pass when a counter is possible", () => {
    const v = view({ viewer: 1, hand: [c("p1-Island-1", "Island"), c("p1-Swamp-2", "Swamp")], stack: [{ kind: "landDrop", player: 0, card: c("p0-Mountain-1", "Mountain"), target: "p1-Plains-3" }], decision: { type: "CounterWindow", player: 1 } });
    show(v, [{ type: "PassCounter" }, { type: "Counter", island: "p1-Island-1", other: "p1-Swamp-2" }, { type: "Concede", player: 1 }, { type: "CancelGame" }], 1);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Opponent played Mountain/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Pass" }));
    expect(send).toHaveBeenCalledWith({ type: "PassCounter" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Counter" }));
    // the only possible discard is preselected; nothing is sent until the player confirms
    expect(within(dialog).getByRole("button", { name: /Swamp, in hand.*selected/ })).toBeInTheDocument();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "Counter" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(send).toHaveBeenCalledWith({ type: "Counter", island: "p1-Island-1", other: "p1-Swamp-2" });
  });

  it("W-35 shows no dialog when only Pass is possible", () => {
    const v = view({ viewer: 1, hand: [c("p1-Swamp-2", "Swamp")], stack: [{ kind: "landDrop", player: 0, card: c("p0-Mountain-1", "Mountain") }], decision: { type: "CounterWindow", player: 1 } });
    show(v, [{ type: "PassCounter" }, { type: "Concede", player: 1 }, { type: "CancelGame" }], 1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Opponent played Mountain");
  });

  it("W-36 shows resolution options only to the chooser", () => {
    const opts = [c("p1-Plains-3", "Plains"), c("p1-Island-4", "Island")];
    const v = view({ decision: { type: "ResolutionChoice", player: 0, choice: "swampDiscard", options: opts } });
    const { unmount } = show(v, [{ type: "ChooseTarget", card: "p1-Island-4" }, ...UI_ONLY]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Confirm" })).toBeDisabled(); // two options: nothing preselected
    fireEvent.click(within(dialog).getByRole("button", { name: /Island/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(send).toHaveBeenCalledWith({ type: "ChooseTarget", card: "p1-Island-4" });
    unmount();
    // a single option is preselected, the player still has to confirm
    send.mockClear();
    const single = show(view({ decision: { type: "ResolutionChoice", player: 0, choice: "swampDiscard", options: [opts[0]!] } }), [{ type: "ChooseTarget", card: "p1-Plains-3" }, ...UI_ONLY]);
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    expect(send).toHaveBeenCalledWith({ type: "ChooseTarget", card: "p1-Plains-3" });
    single.unmount();
    show(view({ viewer: 1, decision: { type: "ResolutionChoice", player: 0, choice: "swampDiscard", options: [] } }), UI_ONLY, 1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Opponent is choosing");
  });

  it("W-81 labels every tile and shows the reconnect state in the bar", () => {
    show(view(), [{ type: "EndTurn" }, ...UI_ONLY]);
    expect(screen.getByRole("button", { name: "Forest, on battlefield" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plains, on battlefield" })).toBeInTheDocument();
    act(() => useGame.setState({ conn: "reconnecting" }));
    expect(screen.getByRole("status")).toHaveTextContent("Connection lost");
  });

  it("a battlefield pile shows at most 3 cards and the count; a target hidden by that limit is still reachable", () => {
    const mountains = [1, 2, 3, 4, 5].map((n) => c(`p1-Mountain-${n}`, "Mountain"));
    show(
      view({ battlefields: [[], mountains] }),
      [{ type: "PlayLand", card: "p0-Mountain-1", target: "p1-Mountain-5" }, { type: "EndTurn" }, ...UI_ONLY],
    );
    expect(screen.getByText("x5")).toBeInTheDocument();
    const shown = screen.getAllByRole("button", { name: /Mountain, on battlefield/ });
    expect(shown).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Mountain, in hand/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Play Mountain?"); // the one legal target is preselected, even though it is the fifth card
  });
});

describe("selection", () => {
  it("is named Cancel and a click outside any card or button drops it", () => {
    show(view(), [{ type: "PlayLand", card: "p0-Swamp-2" }, { type: "EndTurn" }, ...UI_ONLY]);
    fireEvent.click(screen.getByRole("button", { name: /Swamp, in hand/ }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    fireEvent.click(document.body);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Your turn");
  });
});

describe("hand fit", () => {
  const hand = [5, 4, 3, 2, 1]; // cards per land type
  it("shrinks piles one card at a time before it shrinks the cards", () => {
    const at = (w: number) => fitHand(hand, w);
    expect(at(1000)).toEqual({ stack: 3, scale: 1 }); // 768 needed
    expect(at(740)).toEqual({ stack: 2, scale: 1 }); // 720 needed
    expect(at(700)).toEqual({ stack: 1, scale: 1 }); // 656 needed
    expect(at(300).stack).toBe(1);
    expect(at(300).scale).toBeLessThan(1);
    expect(at(300).scale).toBeGreaterThan(0.3);
  });
});
