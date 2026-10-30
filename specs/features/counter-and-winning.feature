Feature: Island counter, winning, and empty library

  @R-30 @R-33
  Scenario: Island plus another land counters a land drop
    Given player 0 holds a Mountain and player 1 holds an Island and a Swamp
    When player 0 plays the Mountain
    Then player 1 is offered a counter
    When player 1 counters with the Island and the Swamp
    Then the Mountain is in player 0's graveyard and the Mountain's effect does not happen
    And the Island and Swamp are in player 1's graveyard

  @R-34
  Scenario: Counter window always opens, even without a possible counter
    Given player 1 holds only an Island
    When player 0 plays a land
    Then player 1 is offered a counter window
    And the only legal action for player 1 besides concede and cancel is to pass

  @R-14
  Scenario: A countered land drop uses up the land drop
    Given player 1 will counter player 0's land drop
    When player 0 plays a land and it is countered
    Then player 0 cannot play another land this turn

  @R-32 @R-33
  Scenario: Counter is countered and the land drop resolves
    Given player 0 holds a Mountain and an Island and a Swamp, and player 1 holds an Island and a Forest
    When player 0 plays the Mountain
    And player 1 counters with the Island and the Forest
    Then player 0 is offered a counter
    When player 0 counters with the Island and the Swamp
    And player 1 passes
    Then the stack resolves and the Mountain enters play and its effect resolves

  @R-32 @R-33
  Scenario: Unanswered counter negates the land drop
    Given player 1 holds an Island and a Forest
    When player 0 plays a land and player 1 counters
    And player 0 passes
    Then the land is in player 0's graveyard and does not enter play

  @R-34
  Scenario: The window also opens for the active player after a counter
    Given player 0 holds no Island after playing a land and player 1 counters
    Then player 0 is offered a counter window with only pass available

  @R-31
  Scenario: Counters can be used repeatedly in a game
    Given player 1 holds two Islands and two other lands
    When player 0 plays a land on two different turns and player 1 counters each time
    Then both land drops are countered

  @R-60
  Scenario: Domain win
    Given player 0 has Plains, Island, Swamp and Mountain on the battlefield and holds a Forest
    When player 0 plays the Forest and it resolves
    Then player 0 wins by Domain

  @R-60
  Scenario: Mono win
    Given player 0 has four Mountains on the battlefield and holds a Mountain
    When player 0 plays the Mountain and it resolves
    Then player 0 wins by Mono

  @R-60 @R-24
  Scenario: Win is checked immediately after the land enters
    Given player 0 would complete Domain with a Forest that has a Forest effect
    When player 0 plays the Forest and it resolves
    Then the game ends before any further decision is asked

  @R-60
  Scenario: A countered land does not win the game
    Given player 0 has four Mountains on the battlefield and holds a Mountain
    And player 1 will counter the land drop
    When player 0 plays the Mountain
    Then player 0 does not win

  @R-70
  Scenario: Empty library loses by default
    Given player 0 must draw and their library is empty and emptyLibrary is "lose"
    When player 0's turn starts
    Then player 1 wins

  @R-70
  Scenario: Empty library reshuffles the graveyard
    Given player 0 must draw, their library is empty, their graveyard has 3 cards, and emptyLibrary is "reshuffle"
    When player 0's turn starts
    Then the graveyard is shuffled into the library
    And player 0 draws one card and the game continues

  @R-70
  Scenario: Reshuffle with an empty graveyard draws nothing
    Given player 0 must draw, their library and graveyard are empty, and emptyLibrary is "reshuffle"
    When player 0's turn starts
    Then no card is drawn and the game continues

  @R-80
  Scenario: Game is drawn when maxTurns is reached
    Given maxTurns is 4
    When the 5th turn would begin
    Then the game ends as a draw

  @R-80
  Scenario: No turn limit by default
    Given a default game
    When 200 turns have been played
    Then the game is not over

  @R-81 @R-83
  Scenario: Concede during the opponent's counter window
    Given player 0 played a land and player 1 has a counter window
    When player 1 concedes
    Then player 0 wins by Concede

  @R-82 @R-83
  Scenario: Cancel ends the game without a winner
    Given a game in progress
    When the game is cancelled
    Then the game is over with result "cancelled"
