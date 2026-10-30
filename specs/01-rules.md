# Rules

Status key: **[S]** stated in the source article, **[D]** decision made with the product owner, **[A]** assumption (revisit in `05-open-questions.md`).

## 1. Setup

- **R-01 [S]** Two players. Each has a library, hand, graveyard, and battlefield (lands in play).
- **R-02 [S]** Default deck: 50 cards, 10 each of Plains, Island, Swamp, Mountain, Forest.
- **R-03 [D]** Config `deckSize: "full" | "half"`. `half` is 25 cards, 5 of each land type. Default `full`.
- **R-04 [S]** Libraries are shuffled (seeded RNG, so games are reproducible). Each player draws an opening hand of 5.
- **R-05 [S]** No mulligans.
- **R-06 [A]** The first player is chosen by config (`firstPlayer: 0 | 1 | "random"`, default `"random"` via the seed).

## 2. Turn structure

- **R-10 [S]** Turns alternate. A turn has: draw, main, end.
- **R-11 [S]** The player who goes first skips the draw on their first turn. Every other turn the active player draws 1 card.
- **R-12 [S]** In the main phase the active player may make at most one land drop: play one land from hand. Playing no land is allowed.
- **R-13 [A]** There is no maximum hand size.
- **R-14 [A]** A countered land drop still uses up the land drop for that turn.

## 3. Land drop and resolution

- **R-20** Playing a land puts it on the stack as a *land drop* (see section 5). The land is not yet in play.
- **R-21** Targets are declared when the land is played (see each land). Declared targets are public.
- **R-22 [S]** The opponent then gets a *counter window* (R-30). If it is not countered, the land enters play and its effect resolves.
- **R-23 [A]** Effects with no legal target or nothing to act on fizzle. The land still enters play (R-71 for how it affects counting).
- **R-24** Win conditions (R-60) are checked after every state change.

## 4. Land effects

- **R-40 Plains [S][D]** Target one of your other non-Plains lands in play (declared at play). When Plains resolves, that land's *entry effect* happens again as if it had just entered, controlled by you. Rules for the copied effect:
  - **R-40a** It may copy Island (draw), Swamp, Mountain, or Forest. It cannot copy Plains.
  - **R-40b** Targets for a copied Mountain or Forest are chosen at resolution, so the opponent knows which land is reused but not what it will do. The copied Swamp discard is chosen at resolution as normal.
  - **R-40c** Plains with no valid target fizzles.
  - **R-40d** Island's counter ability (R-30) is not an entry effect and is never copied.
- **R-41 Island (played) [S]** When it resolves, draw a card.
- **R-42 Swamp [S]** When it resolves, look at the opponent's hand, then choose a land card in it to discard. The opponent does not know which card is chosen when deciding on a counter. [D] The Swamp player chooses. Empty opposing hand: fizzles.
  - **R-42a [D]** The revealed hand is private to the Swamp player. The opponent only learns that a reveal happened, and what was discarded.
- **R-43 Mountain [S]** Target an opposing land in play (declared at play, public). When it resolves, destroy it: it goes to its owner's graveyard. If the target left play before resolution, it fizzles. No opposing lands in play: fizzles.
- **R-44 Forest [S]** Target a land card in your graveyard (declared at play, public). When it resolves, return it to your hand. Empty graveyard: fizzles. Any land can be targeted, including one discarded by Swamp or Island.

## 5. Island counter and the stack

- **R-30 [S][D]** A player may *counter* the item on top of the stack by discarding an Island plus any one other land from their hand (the cost, paid immediately; both go to their graveyard). A counter is a new item on the stack.
- **R-31 [D]** Counters are not land drops and can be used any number of times per game.
- **R-32 [D]** Counters can themselves be countered, in an unlimited chain. After each item is added, the opponent of the player who added it gets a counter window. The chain ends when a player passes.
- **R-33** When the chain ends, the stack resolves from the top: each counter negates the item directly below it. Net effect: if the number of counters is odd, the land drop is countered; if even, it resolves. A negated land drop's land goes to its owner's graveyard without entering play and its effect does not happen.
- **R-34 [D]** A counter window always opens for the responder, even if they cannot pay for a counter (then `PassCounter` is their only action). This avoids leaking hidden information through timing. Clients and servers may auto-pass a window where only `PassCounter` is legal, after a randomized delay.
- **R-35** The first counter window of a land drop belongs to the non-active player. The active player's land drop already left their hand when it went on the stack.
- **R-20a** The stack holds the land drop and any counters, last in first out.

## 6. Winning

- **R-60 [S]** A player wins as soon as either holds on their battlefield:
  - **Domain**: at least one of each of the five land types.
  - **Mono**: at least five lands of a single type.
- **R-61 [A]** If both players meet a win condition at the same moment, the active player wins.

## 7. Library and graveyard

- **R-70 [D]** Config `emptyLibrary: "lose" | "reshuffle"`. Default `"lose"`.
  - `"lose"`: a player who must draw from an empty library loses immediately.
  - `"reshuffle"`: the player's graveyard is shuffled into their library and the draw continues. If the graveyard is also empty, the draw does nothing and the game continues.
- **R-71** Effects fizzle without penalty (the game does not end because an effect had no target).

## 8. Game end other than winning

- **R-80 [D]** Config `maxTurns: number | null`, default `null` (no limit). When the turn counter would exceed `maxTurns`, the game ends as a draw. Turns are counted per player turn, starting at 1.
- **R-81 [D]** Concede: either player may concede at any time, including when it is not their decision (e.g. during a counter window). The other player wins by `Concede`.
- **R-82 [D]** Cancel: the game can be cancelled at any time. It ends with no winner and no draw (result `cancelled`).
- **R-83** Concede and cancel are always legal actions while the game is not over, regardless of the pending decision.
