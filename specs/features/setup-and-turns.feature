Feature: Setup and turn structure

  @R-02 @R-04 @R-05
  Scenario: Default game setup
    When a game is created with default config
    Then each player has a library of 45 cards and a hand of 5 cards
    And the combined 50 cards of each player contain 10 of each land type

  @R-03
  Scenario: Half deck option
    When a game is created with deckSize "half"
    Then each player has a library of 20 cards and a hand of 5 cards
    And the combined 25 cards of each player contain 5 of each land type

  @R-04
  Scenario: Same seed gives the same game
    When two games are created with the same seed
    Then both games have identical hands and library order

  @R-11
  Scenario: First player skips the first draw
    Given player 0 goes first
    When the game starts
    Then player 0 has a hand of 5 cards in the main phase
    When player 0 ends the turn
    Then player 1 has a hand of 6 cards in the main phase

  @R-12
  Scenario: Only one land drop per turn
    Given it is player 0's main phase and they hold two lands
    When player 0 plays a land and it resolves
    Then player 0 cannot play a second land this turn

  @R-12
  Scenario: Playing no land is allowed
    Given it is player 0's main phase
    When player 0 ends the turn
    Then it is player 1's turn
